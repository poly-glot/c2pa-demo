import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../config/index.mjs';
import { ffmpeg, H264 } from '../lib/video.mjs';

const OUTPUT = fileURLToPath(new URL('../samples/Reference-Clip_AI-Generated_DAT-Create.mp4', import.meta.url));
const SOURCE = 'testsrc2=size=640x360:rate=24:duration=3';
const AGENT = 'Reference video model';

export const generateClip = (path) => ffmpeg(['-f', 'lavfi', '-i', SOURCE, ...H264, '-crf', '32', path]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await generateClip(OUTPUT);
    const { stdout } = await promisify(execFile)(loadConfig().provenanceBinary, [
        'create',
        OUTPUT,
        '-o',
        OUTPUT,
        '--agent',
        AGENT,
    ]);
    process.stdout.write(stdout);
}
