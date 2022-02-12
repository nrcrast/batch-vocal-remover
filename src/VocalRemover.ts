import * as mkdirp from "mkdirp";
import * as fs from 'fs/promises';
import { FileConfig } from "./input-path-parser";
import { spawnWithLogging } from "./spawn-with-logging";
import * as NodeID3 from "node-id3";
import * as path from "path";

const VOC_REMOVER_INFERENCE = path.resolve(process.env.VOC_REMOVER_PATH, 'inference.py');

export class VocalRemover {
    constructor(private file: FileConfig, private onProgress: (pct?: number) => void) { }
    public async removeVocals(): Promise<void> {
        const vocRemoverArgs = [VOC_REMOVER_INFERENCE, '-g', '1', '-m', path.join('modelparams', '2band_32000.json'),
            '-H', 'mirroring', '-D', '-w', '352', '-P', path.join('models', 'MGM-v5-KAROKEE-32000-BETA1.pth'), '-t', '-i', this.file.input];

        await spawnWithLogging('VocRemover', process.env.PYTHON_PATH, vocRemoverArgs, { cwd: process.env.VOC_REMOVER_PATH }, (data) => {
            const splitData = data.split('|');
            if (splitData[0].endsWith('%')) {
                const progress = parseInt(splitData[0].slice(0, splitData[0].length - 1));
                this.onProgress(progress);
            }
        });
    }

    public async convertToMp3() {
        console.log(`Making dir: ${path.dirname(this.file.output)}`);
        await mkdirp(path.dirname(this.file.output));
        const convertArgs = [
            '-infile',
            this.file.outputWav,
            '-outfile',
            this.file.output,
            '-dspeffect3',
            'Volume Normalize=-mode={qt}peak{qt} -maxamp={qt}100{qt} -desiredb={qt}-.1{qt}',
            '-convert_to',
            'mp3 (Lame)',
            '-V 0'
        ];
        await spawnWithLogging('DbPowerAmp', process.env.DB_POWER_AMP_PATH, convertArgs, undefined, (data) => {
            if (data.trim().startsWith('*')) {
                this.onProgress();
            }
        });
        const f = await fs.readFile(this.file.output);

        const oldTags = this.file.tags;
        const newTags: NodeID3.Tags = {
            trackNumber: oldTags.track.no.toString(),
            album: oldTags.album,
            artist: oldTags.artist ?? oldTags.albumartist,
            title: oldTags.title,
        };
        const newFile = await NodeID3.write(newTags, f);
        await fs.writeFile(this.file.output, newFile);
        await fs.unlink(this.file.outputWav);
        await fs.unlink(this.file.outputVoxWav);
    }

}