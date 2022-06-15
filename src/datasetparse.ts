const exec: any = require('await-exec');// no TS support
const yaml = require('js-yaml');
const fs   = require('fs');
const rrdir = require('rrdir');

(async () => {
    for await (const file of rrdir(process.argv[2])) {
        if(file.path.endsWith('yaml')) {
            console.log(`Parsing ${file.path}`);
            try {
              const doc = yaml.load(fs.readFileSync(file.path, 'utf8'));
              for (let i = 0; i < doc.Resources.length; i++) {
                  const res = doc.Resources[i];
                  const s3bucket = res.ARN.substring(res.ARN.lastIndexOf(':') + 1);
                  const outputfile = s3bucket.replace('/', '-') + '.txt';
                  const cmd = `aws s3 ls s3://${s3bucket} --no-sign-request --summarize --human-readable --recursive > ${process.argv[3]}/${outputfile}`;
                  console.log(cmd);
                  let timeSpentInMs = performance.now();
                  const output = await exec(cmd, { "shell": "/bin/bash" });
                  timeSpentInMs = performance.now() - timeSpentInMs;
                  console.log(output);
                  console.log(`----------- Took ${timeSpentInMs / 1000} secs --------------`);
              }
            } catch (e) {
              console.log(e);
            }
            break;
        }
    }
})();