import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';

const TODAY = new Date().toISOString().slice(0,10);
const REPORT = `reports/scan-${TODAY}.md`;
const DONE_FILE = 'reports/.scan-done.json';

// Load already-done companies to allow resume
const done = fs.existsSync(DONE_FILE) ? JSON.parse(fs.readFileSync(DONE_FILE,'utf8')) : {};

// Search queries per company type
const KEYWORDS = 'materials compliance REACH RoHS IMDS';
const EU_COUNTRIES = 'Germany OR Netherlands OR Belgium OR Austria OR Sweden OR Denmark OR France OR "Czech Republic" OR Poland OR Hungary';

const companies = [
  // OEM
  {name:'BMW Group', site:'bmwgroup.jobs', tier:'OEM', country:'DE'},
  {name:'Mercedes-Benz', site:'mercedes-benz.com/en/career', tier:'OEM', country:'DE'},
  {name:'Volkswagen Group', site:'volkswagenag.com', tier:'OEM', country:'DE'},
  {name:'Audi', site:'audi.com/en/career', tier:'OEM', country:'DE'},
  {name:'Porsche', site:'porsche.com', tier:'OEM', country:'DE'},
  {name:'Continental AG', site:'continental.com/en/career', tier:'OEM', country:'DE'},
  {name:'Volvo Cars', site:'volvocars.com', tier:'OEM', country:'SE'},
  {name:'Volvo Group', site:'volvogroup.com/en/careers', tier:'OEM', country:'SE'},
  {name:'Scania', site:'scania.com', tier:'OEM', country:'SE'},
  {name:'Renault Group', site:'renaultgroup.com', tier:'OEM', country:'FR'},
  {name:'Skoda Auto', site:'skoda-auto.com', tier:'OEM', country:'CZ'},
  {name:'Stellantis', site:'stellantis.com/en/careers', tier:'OEM', country:'DE'},
  // T1
  {name:'Bosch', site:'bosch.com/careers', tier:'T1', country:'DE'},
  {name:'ZF Friedrichshafen', site:'jobs.zf.com', tier:'T1', country:'DE'},
  {name:'Schaeffler', site:'schaeffler.com/en/career', tier:'T1', country:'DE'},
  {name:'Siemens', site:'jobs.siemens.com', tier:'T1', country:'DE'},
  {name:'Infineon Technologies', site:'infineon.com/cms/en/careers', tier:'T1', country:'DE'},
  {name:'TE Connectivity', site:'te.com', tier:'T1', country:'DE'},
  {name:'Aptiv', site:'aptiv.com/en/careers', tier:'T1', country:'DE'},
  {name:'Valeo', site:'jobs.valeo.com', tier:'T1', country:'FR'},
  {name:'Faurecia FORVIA', site:'forvia.com/en/careers', tier:'T1', country:'FR'},
  {name:'Magna International', site:'magna.com/company/careers', tier:'T1', country:'AT'},
  {name:'AVL List', site:'avl.com/en/careers', tier:'T1', country:'AT'},
  {name:'Hella FORVIA', site:'hella.com', tier:'T1', country:'DE'},
  {name:'Vitesco Technologies', site:'vitesco-technologies.com', tier:'T1', country:'DE'},
  {name:'Brose', site:'brose.com', tier:'T1', country:'DE'},
  {name:'Webasto', site:'webasto-group.com', tier:'T1', country:'DE'},
  {name:'Leoni AG', site:'leoni.com/en/career', tier:'T1', country:'DE'},
  {name:'NXP Semiconductors', site:'nxp.com/company/careers', tier:'T1', country:'NL'},
  {name:'Philips', site:'philips.com/a-w/about/jobs', tier:'T1', country:'NL'},
  {name:'Sensata Technologies', site:'sensata.com/careers', tier:'T1', country:'NL'},
  {name:'Umicore', site:'umicore.com/en/careers', tier:'T1', country:'BE'},
  {name:'Solvay', site:'solvay.com/en/careers', tier:'T1', country:'BE'},
  {name:'SKF', site:'skf.com/group/careers', tier:'T1', country:'SE'},
  {name:'ABB', site:'new.abb.com/careers', tier:'T1', country:'SE'},
  {name:'Sandvik', site:'home.sandvik/en/careers', tier:'T1', country:'SE'},
  {name:'AT&S', site:'ats.net/career', tier:'T1', country:'AT'},
  {name:'Wuerth Elektronik', site:'we-online.com', tier:'T1', country:'DE'},
  {name:'Osram', site:'jobs.osram.com', tier:'T1', country:'DE'},
  {name:'BorgWarner', site:'borgwarner.com/careers', tier:'T1', country:'PL'},
];

// Init report
if (!fs.existsSync(REPORT)) {
  fs.writeFileSync(REPORT, `# EU Compliance Scan Report — ${TODAY}

Scope: REACH | RoHS | IMDS | Materials Compliance | All EU OEM + T1

## Results

| # | Company | Title | Country | Tier | URL | Notes |
|---|---------|-------|---------|------|-----|-------|
`);
}

function appendRow(row) {
  fs.appendFileSync(REPORT, row + '\n');
}

function searchCompany(company) {
  const q = encodeURIComponent(`site:${company.site} "${KEYWORDS.split(' ').slice(0,3).join(' ')}" OR "REACH" OR "RoHS" OR "IMDS" compliance`);
  return `https://www.google.com/search?q=${q}`;
}

let rowNum = Object.keys(done).length;

console.log(`\n🔍 Starting EU Compliance Scan — ${TODAY}`);
console.log(`📋 ${companies.length} companies to scan`);
console.log(`📄 Report: ${REPORT}\n`);

for (const company of companies) {
  if (done[company.name]) {
    console.log(`⏭  Skipping ${company.name} (already scanned)`);
    continue;
  }

  const searchUrl = searchCompany(company);
  const linkedinUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent('materials compliance REACH ' + company.name)}&location=Europe&sortBy=DD`;
  
  rowNum++;
  appendRow(`| ${rowNum} | **${company.name}** | _scan via search_ | ${company.country} | ${company.tier} | [Search](${searchUrl}) | [LinkedIn](${linkedinUrl}) |`);
  
  done[company.name] = { scanned: new Date().toISOString(), searchUrl };
  fs.writeFileSync(DONE_FILE, JSON.stringify(done, null, 2));
  
  console.log(`✅ ${rowNum}/${companies.length} — ${company.name} (${company.tier}, ${company.country})`);
  
  // Small delay to avoid hammering
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
}

// Add portal search links at the end
fs.appendFileSync(REPORT, `
## Job Portal Search Links (check manually or via next scan session)

| Portal | Search URL |
|--------|------------|
| LinkedIn Jobs | https://www.linkedin.com/jobs/search/?keywords=materials+compliance+REACH+RoHS&location=Europe&sortBy=DD |
| XING | https://www.xing.com/jobs/search?keywords=materials+compliance+REACH&location=Europa |
| StepStone DE | https://www.stepstone.de/jobs/materials-compliance |
| Indeed DE | https://de.indeed.com/jobs?q=materials+compliance+REACH+RoHS |
| EuroEngineerJobs | https://www.eurengineersjobs.com/jobs/?keywords=compliance+REACH |
| Glassdoor EU | https://www.glassdoor.com/Job/europe-materials-compliance-jobs-SRCH_IL.0,6_IS3333_KO7,27.htm |

## Already Applied
| Company | Role | Date | Status |
|---------|------|------|--------|
| Sennheiser | Material Compliance Specialist REACH & RoHS (m/w/d) #729 | 2026-05-06 | Submitted |
| Schaeffler | (see report 001) | 2026-05-05 | Submitted |

## Next Steps
1. Open each company Search link above and look for open compliance roles
2. Check LinkedIn portal link — filter by \"Past week\" for freshest results
3. For any promising role: run \`reinitiate career ops and apply for [URL]\`
4. Update tracker.md with any new applications

---
_Scan generated: ${new Date().toISOString()}_
`);

console.log('\n✅ Scan complete!');
console.log(`📄 Report saved: ${REPORT}`);
console.log(`\n👉 Open the report:\n   cat ${REPORT}`);
