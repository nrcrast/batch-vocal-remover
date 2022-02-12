import * as fs from 'fs/promises';
import * as mm from 'music-metadata';
import * as path from 'path';

const replaceExt = require('replace-ext');

export type FileConfig = {
    input: string; // Absolute path to input file
    filename: string; // Filename of input file
    outputWav: string; // Absolute path to output instrumental WAV
    outputVoxWav: string; // Absolute path to output vocals WAV
    output: string; // Desired MP3 Path
    directory?: string; // Subdirectory to create of format '{Artist} - {Album}' -- only used if input has ID3 tags
    tags?: mm.ICommonTagsResult; // ID3 tags from input
}

export class InputPathParser {
    constructor(private inputPath: string) { }

    public async parse(): Promise<FileConfig[]> {
        const stats = await fs.stat(this.inputPath);
        const files = stats.isFile() ? [this.inputPath] : await fs.readdir(this.inputPath);
        const fullFilePaths = await Promise.all(files.filter(file => this.isAudioFile(file)).map(file => this.buildFullPathForFile(file, stats.isFile())));
        return fullFilePaths;
    }

    private isAudioFile(file: string): boolean {
        return file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.wav') || file.toLowerCase().endsWith('.flac');
    }

    private async buildFullPathForFile(filePath: string, isAbsolutePathToFile = false): Promise<FileConfig> {
        const absolutePath = isAbsolutePathToFile ? filePath : path.join(this.inputPath, filePath);
        const outputWav = path.basename(replaceExt(absolutePath, '.wav').replace('.wav', '_MGM-v5-KAROKEE-32000-BETA1_Instruments.wav'));
        const outputVoxWav = path.basename(replaceExt(absolutePath, '.wav').replace('.wav', '_MGM-v5-KAROKEE-32000-BETA1_Vocals.wav'));
        const tags = await mm.parseFile(absolutePath);
        const directory = (tags?.common.artist && tags?.common.album) ? `${tags.common.artist} - ${tags.common.album}` : undefined;

        let finalFileName = path.basename(replaceExt(absolutePath, '.mp3'));

        if (tags?.common) {
            finalFileName = `${tags.common.track.no}. ${tags.common.artist} - ${tags.common.album} - ${tags.common.title} (Instrumental).mp3`;
            tags.common.album = `${tags.common.album} (Instrumental)`;
            tags.common.title = `${tags.common.title} (Instrumental)`;
        }
        let finalOutputMp3 = path.resolve(process.env.VOC_REMOVER_PATH, 'separated', directory ? directory : '.', finalFileName);

        return {
            input: absolutePath,
            filename: path.basename(finalOutputMp3),
            outputWav: path.resolve(process.env.VOC_REMOVER_PATH, 'separated', outputWav),
            outputVoxWav: path.resolve(process.env.VOC_REMOVER_PATH, 'separated', outputVoxWav),
            output: finalOutputMp3,
            directory,
            tags: tags?.common,
        };
    };
}
