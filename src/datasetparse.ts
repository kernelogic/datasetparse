const exec: any = require('await-exec');// no TS support
const yaml = require('js-yaml');
const fs = require('fs');
const rrdir = require('rrdir');

(async () => {
  for await (const file of rrdir(process.argv[2])) {
    if (file.path.endsWith('yaml')) {
      console.log(`Parsing ${file.path}`);
      try {
        const doc = yaml.load(fs.readFileSync(file.path, 'utf8'));
        for (let i = 0; i < doc.Resources.length; i++) {
          const res = doc.Resources[i];
          const s3bucket = res.ARN.substring(res.ARN.lastIndexOf(':') + 1);
          const outputfile = process.argv[3] + '/' + s3bucket.replaceAll('/', '-') + '.txt';
          let shouldSkip = false;
          try {
            const stats = fs.statSync(outputfile);
            if(stats.size > 0){
              shouldSkip = true;
              console.warn(`File ${outputfile} already exist with size of ${stats.size}`);
            }
          }
          catch (err) {
          }
          let timeSpentInMs = performance.now();
          if(!shouldSkip) {
            const cmd = `aws s3 ls s3://${s3bucket} --no-sign-request --summarize --human-readable --recursive > ${outputfile}`;
            console.log(cmd);
            const output = await exec(cmd, { "shell": "/bin/bash" });
            console.log(output);
          }
          const output = await exec(`tail ${outputfile}`, { "shell": "/bin/bash" });
          console.log(output.stdout);
          timeSpentInMs = performance.now() - timeSpentInMs;
          console.log(`----------- Took ${timeSpentInMs / 1000} secs --------------`);
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
})();