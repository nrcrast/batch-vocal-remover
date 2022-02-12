require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { program } = require('commander');
const { spawn } = require('child_process');
const replaceExt = require('replace-ext');
const cliProgress = require('cli-progress');
const cliColors = require('colors');
const NodeID3 = require('node-id3').Promise;
const mkdirp = require('mkdirp');

const PYTHON_PATH = process.env.PYTHON_PATH;
const VOC_REMOVER_PATH = process.env.VOC_REMOVER_PATH;
const VOC_REMOVER_INFERENCE = path.resolve(VOC_REMOVER_PATH, 'inference.py');
const DB_POWER_AMP_PATH = process.env.DB_POWER_AMP_PATH;

program
    .requiredOption('-i, --input <path>', 'input file or directory')
    .option('-n, --numthreads <num>', 'Number of simultaneous conversions', 1, (value) => {
        const parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
            throw new commander.InvalidArgumentError('Not a number.');
        }
        return parsedValue;
    });

program.parse(process.argv);

const options = program.opts();

const inputPath = path.resolve(options.input);

function isAudioFile(file) {
    return file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.wav') || file.toLowerCase().endsWith('.flac');
}

async function getFiles(filePath) {
    const buildFullPathForFile = async (file, absolute = false) => {
        const absolutePath = absolute ? file : path.join(inputPath, file);
        const outputWav = path.basename(replaceExt(absolutePath, '.wav').replace('.wav', '_MGM-v5-KAROKEE-32000-BETA1_Instruments.wav'));
        const outputVoxWav = path.basename(replaceExt(absolutePath, '.wav').replace('.wav', '_MGM-v5-KAROKEE-32000-BETA1_Vocals.wav'));
        const tags = await NodeID3.read(absolutePath);
        const directory = (tags && tags.artist && tags.album) ? `${tags.artist} - ${tags.album}` : undefined;

        let finalFileName = path.basename(replaceExt(absolutePath, '.mp3'));

        if (tags) {
            finalFileName = `${tags.trackNumber}. ${tags.artist} - ${tags.album} - ${tags.title} (Instrumental).mp3`;
            tags.album = `${tags.album} (Instrumental)`;
            tags.title = `${tags.title} (Instrumental)`;
        }
        let finalOutputMp3 = path.resolve(VOC_REMOVER_PATH, 'separated', directory ? directory : '.', finalFileName);

        return {
            input: absolutePath,
            filename: path.basename(finalOutputMp3),
            outputWav: path.resolve(VOC_REMOVER_PATH, 'separated', outputWav),
            outputVoxWav: path.resolve(VOC_REMOVER_PATH, 'separated', outputVoxWav),
            output: finalOutputMp3,
            directory,
            tags,
        };
    };
    const stats = await fs.promises.stat(filePath);
    const files = stats.isFile() ? [filePath] : await fs.promises.readdir(filePath);
    const fullFilePaths = await Promise.all(files.filter(file => isAudioFile(file)).map(file => buildFullPathForFile(file, stats.isFile())));
    return fullFilePaths;
}

async function spawnWithLogging(name, cmd, opts, spawnOpts, outputAdapter) {
    const childProcess = spawn(cmd, opts, spawnOpts);

    return new Promise((resolve, reject) => {
        // console.log(`Spawning ${cmd} ${opts.join(' ')}`);

        childProcess.stdout.on('data', function (data) {
            if (outputAdapter) {
                outputAdapter(data.toString());
            } else {
                console.log(`[${name}]: `, data.toString());
            }
        });
        childProcess.stderr.on('data', function (data) {
            if (outputAdapter) {
                outputAdapter(data.toString());
            } else {
                console.log(`ERR [${name}]: `, data.toString());
            }
        });

        childProcess.on('error', (e) => {
            console.log(e);
            resolve();
        });

        childProcess.on('close', () => {
            resolve();
        });
    });
}

async function removeVocalsFrom(file, bar) {
    const vocRemoverArgs = [VOC_REMOVER_INFERENCE, '-g', '1', '-m', path.join('modelparams', '2band_32000.json'),
        '-H', 'mirroring', '-D', '-w', '352', '-P', path.join('models', 'MGM-v5-KAROKEE-32000-BETA1.pth'), '-t', '-i', file];

    await spawnWithLogging('VocRemover', PYTHON_PATH, vocRemoverArgs, { cwd: VOC_REMOVER_PATH }, (data) => {
        const splitData = data.split('|');
        if (splitData[0].endsWith('%')) {
            const progress = (parseInt(splitData[0].slice(0, splitData[0].length - 1)) * 100) / bar.getTotal();
            bar.update(progress);
        }
    });
}

async function convertToMp3(file, bar) {
    console.log(`Making dir: ${path.dirname(file.output)}`);
    await mkdirp(path.dirname(file.output));
    const convertArgs = [
        '-infile',
        file.outputWav,
        '-outfile',
        file.output,
        '-dspeffect3',
        'Volume Normalize=-mode={qt}peak{qt} -maxamp={qt}100{qt} -desiredb={qt}-.1{qt}',
        '-convert_to',
        'mp3 (Lame)',
        '-V 0'
    ];
    await spawnWithLogging('DbPowerAmp', DB_POWER_AMP_PATH, convertArgs, undefined, (data) => {
        if (data.trim().startsWith('*')) {
            bar.increment();
        }
    });
    const f = await fs.promises.readFile(file.output);
    const newFile = await NodeID3.write(file.tags, f);
    await fs.promises.writeFile(file.output, newFile);
    await fs.promises.unlink(file.outputWav);
    await fs.promises.unlink(file.outputVoxWav);
}

function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}


async function main() {
    const files = await getFiles(inputPath);

    if (process.env.DEBUG) {
        console.log(files);
        console.log(options.numthreads);
    } else {
        files.forEach(file => {
            console.log(file.filename);
        });
    }

    const multibar = new cliProgress.MultiBar({
        format: cliColors.cyan('{bar}') + '| {percentage}% || File: {filename}',
        clearOnComplete: true,
        hideCursor: true

    }, cliProgress.Presets.shades_grey);

    const numThreads = parseInt(options.numthreads, 10);
    let activeConversions = [];

    const singleConversionFinished = () => {
        const numToAdd = Math.min(numThreads - activeConversions.length, files.length);

        if (numToAdd === 0) {
            console.log('Done!');
            multibar.stop();
            return;
        }

        for (let i = 0; i < numToAdd && files.length > 0; i++) {
            const file = files.shift();
            activeConversions.push(file);
            const bar = multibar.create(160, 0, { filename: file.filename });
            bar.update(0);
            removeVocalsFrom(file.input, bar).then(() => {
                return convertToMp3(file, bar);
            }).catch((e) => {
                console.error('Issue converting!', e);
            }).finally(() => {
                activeConversions = removeItemOnce(activeConversions, file);
                bar.update(160);
                bar.stop();
                singleConversionFinished();
            });
        }
    };

    singleConversionFinished();
}

main();