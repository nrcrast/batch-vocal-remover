import { spawn, SpawnOptions } from "child_process";

export async function spawnWithLogging(name: string, cmd: string, opts?: string[], spawnOpts?: SpawnOptions, outputAdapter?: (val: string) => void): Promise<void> {
    const childProcess = spawn(cmd, opts, spawnOpts);

    return new Promise<void>((resolve, _reject) => {
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
