const exec: any = require('await-exec');// no TS support
const yaml = require('js-yaml');
const fs = require('fs');
const rrdir = require('rrdir');
const events = require('events');
const readline = require('readline');
const path = require('path');
const ObjectsToCsv: any = require('objects-to-csv');// no TS support
const asyncsv: any = require('async-csv');

const totalCountRegex = /Total Objects: (.*)/;
const totalSizeRegex = /Total Size: (.*)/;
const filelineRegex = /\d{4}-\d{2}-\d{2}\s\S+\s+\S+\s\S+\s(.*)/;

/**
 * This script take the input from datasetparse.ts and generate a csv report containing all datasets
 * Usage: 
 *  npx tsc && node dist/resultparse.js /tmp/odr/datasets /tmp/odr_result /tmp/alldataset.csv
 */
(async () => {
    let csvObjects = [];
    try {
        // Read file from disk:
        console.log(process.argv);
        const csvString = fs.readFileSync(process.argv[4], 'utf-8');
        // Convert CSV string into rows:
        csvObjects = await asyncsv.parse(csvString, {
            columns: true
        });
    } catch (error) {
        console.error(error);
    }
    let timeSpentInMs = performance.now();
    for await (const file of rrdir(process.argv[2])) {
        if (file.path.endsWith('yaml')) {
            try {
                const doc = yaml.load(fs.readFileSync(file.path, 'utf8'));
                for (let i = 0; i < doc.Resources.length; i++) {
                    const res = doc.Resources[i];
                    if (csvObjects.filter(function (e: any) { return e.name === doc.Name; }).length > 0) {
                        console.warn(`Dataset ${doc.Name} already in CSV, continue`);
                        continue;
                    }
                    try {
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
                                let downloadCandidate: string | null = null;
                                rl.on('line', (line: string) => {
                                    if (!line.endsWith('/')) { // not a folder
                                        const lineMatch = line.match(filelineRegex);
                                        if (lineMatch != null && lineMatch.length > 1) {
                                            extensions.add(path.extname(lineMatch[1]))
                                            if (!downloadCandidate) {
                                                downloadCandidate = lineMatch[1];
                                            }
                                        }
                                    }
                                });
                                await events.once(rl, 'close');

                                // attempt to download the first file with extension
                                let downloadable = false;
                                if (downloadCandidate) {
                                    try {
                                        const s3bucket = res.ARN.substring(res.ARN.lastIndexOf(':') + 1);
                                        //process bucket like s3://aws-roda-hcls-datalake/thousandgenomes_dragen
                                        const s3bucketSplit = s3bucket.split('/');
                                        const s3bucketWithoutSubfolder = s3bucketSplit[0] + '//' + s3bucketSplit[2];
                                        const cmd = `aws s3 cp s3://${s3bucketWithoutSubfolder}/${downloadCandidate} --no-sign-request /tmp`;
                                        console.log(cmd);
                                        const output = await exec(cmd, { "shell": "/bin/bash" });
                                        console.log(output);
                                        downloadable = true;
                                    } catch (error) {
                                        console.error(`Cannot download`, error)
                                    }
                                } else {
                                    console.warn(`No download candidate`)
                                }

                                csvObjects.push({
                                    name: doc.Name,
                                    description: doc.Description,
                                    documentation: doc.Documentation,
                                    license: doc.License,
                                    downloadable: downloadable,
                                    ARN: res.ARN,
                                    region: res.Region,
                                    numberOfFiles: countMatch[1],
                                    totalSize: sizeMatch[1],
                                    extensions: extensions.size <= 10 ? Array.from(extensions).join(' ') : `various ${extensions.size}`
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