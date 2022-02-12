import './env.js';
import * as path from 'path';
import commander, { program } from 'commander';
import * as cliProgress from 'cli-progress';
import * as cliColors from 'colors';
import { removeItemOnce } from './utils';
import { InputPathParser } from './input-path-parser';
import { VocalRemover } from './VocalRemover';

program
    .requiredOption('-i, --input <path>', 'input file or directory')
    .option<number>('-n, --numthreads <num>', 'Number of simultaneous conversions', (value, _unused) => {
        const parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
            throw new commander.InvalidArgumentError('Not a number.');
        }
        return parsedValue;
    }, 1);

program.parse(process.argv);

const options = program.opts();

const absoluteInputPath = path.resolve(options.input);

async function main() {
    const parser = new InputPathParser(absoluteInputPath);
    const files = await parser.parse();

    if (process.env.DEBUG) {
        console.log(files);
        console.log(options.numthreads);
    } else {
        files.forEach(file => {
            console.log(file.filename);
        });
    }

    const multibar = new cliProgress.MultiBar({
        format: cliColors.cyan('{bar}') + '| {percentage}% || [{status}] {filename}',
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
            console.log(`Starting conversion of ${file.filename}`);
            const shortName = file.tags?.title ?? file.filename;
            const bar = multibar.create(160, 0, { filename: shortName, status: 'Removing Vox' });
            bar.update(0);
            const remover = new VocalRemover(file, pct => {
                if (pct !== undefined) {
                    bar.update((pct * 100) / bar.getTotal());
                } else {
                    bar.increment();
                }
            });
            remover.removeVocals().then(() => {
                bar.update(null, { filename: shortName, status: 'Converting' })
                return remover.convertToMp3();
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