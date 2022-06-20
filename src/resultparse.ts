const exec: any = require('await-exec');// no TS support
const yaml = require('js-yaml');
const fs = require('fs');
const rrdir = require('rrdir');
const events = require('events');
const readline = require('readline');
const path = require('path');
const ObjectsToCsv: any = require('objects-to-csv');// no TS support

const totalCountRegex = /Total Objects: (.*)/;
const totalSizeRegex = /Total Size: (.*)/;
const filelineRegex = /\d{4}-\d{2}-\d{2}\s\S+\s+\S+\s\S+\s(.*)/;

/**
 * This script take the input from datasetparse.ts and generate a csv report containing all datasets
 */
(async () => {
    const csvObjects = [];
    let timeSpentInMs = performance.now();
    for await (const file of rrdir(process.argv[2])) {
        if (file.path.endsWith('yaml')) {
            try {
                const doc = yaml.load(fs.readFileSync(file.path, 'utf8'));
                for (let i = 0; i < doc.Resources.length; i++) {
                    try {
                        const res = doc.Resources[i];
                        const s3bucket = res.ARN.substring(res.ARN.lastIndexOf(':') + 1);
                        const txtPath = process.argv[3] + '/' + s3bucket.replaceAll('/', '-') + '.txt';
                        console.log(`Probe ${txtPath}`);
                        const output = await exec(`tail ${txtPath}`);
                        if (output.stdout.length > 0) {
                            const countMatch = output.stdout.match(totalCountRegex);
                            const sizeMatch = output.stdout.match(totalSizeRegex);
                            if (countMatch != null && countMatch.length > 1 && sizeMatch != null && sizeMatch.length > 1) {
                                console.log(`Total files ${countMatch[1]}`);
                                console.log(`Total size ${sizeMatch[1]}`);

                                // read line by line and find distinct extension name
                                const extensions = new Set<string>();
                                const rl = readline.createInterface({
                                    input: fs.createReadStream(txtPath),
                                    crlfDelay: Infinity
                                });
                                rl.on('line', (line: string) => {
                                    const lineMatch = line.match(filelineRegex);
                                    if (lineMatch != null && lineMatch.length > 1) {
                                        extensions.add(path.extname(lineMatch[1]))
                                    } else {
                                        console.debug(`Not a file: ${line}`);
                                    }
                                });
                                await events.once(rl, 'close');
                                csvObjects.push({
                                    name: doc.Name,
                                    description: doc.Description,
                                    documentation: doc.Documentation,
                                    license: doc.License,
                                    ARN: res.ARN,
                                    region: res.Region,
                                    numberOfFiles: countMatch[1],
                                    totalSize: sizeMatch[1],
                                    extensions: Array.from(extensions).join(' ')
                                })
                            } else {
                                console.error(`Incomplete txt file?`, output.stdout);
                                continue;
                            }
                        } else {
                            console.error(`Empty txt file?`, output);
                        }
                    } catch (error) {
                        // most likely txt file not found
                        continue;
                    }
                }
            } catch (e) {
                console.log(e);
            }
        }
    }
    const csv = new ObjectsToCsv(csvObjects);
    await csv.toDisk(process.argv[4]);
    console.log(`CSV written to ${process.argv[4]}`);
    timeSpentInMs = performance.now() - timeSpentInMs;
    console.log(`----------- Took ${timeSpentInMs / 1000} secs --------------`);
})();

export { };