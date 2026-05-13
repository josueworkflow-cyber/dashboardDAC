const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  { from: '<option>pulse</option>', to: '<option value="PULSE">PULSE</option>' },
  { from: '<option>Pulse</option>', to: '<option value="PULSE">PULSE</option>' },
  { from: '<option value="Pulse">Pulse</option>', to: '<option value="PULSE">PULSE</option>' },
  { from: '<option>Dac</option>', to: '<option value="DAC">DAC</option>' },
  { from: '<option value="Dac">Dac</option>', to: '<option value="DAC">DAC</option>' },
  { from: '<option value="Emitida pela Dac">Emitida pela Dac</option>', to: '<option value="Emitida pela DAC">Emitida pela DAC</option>' },
  { from: '<option value="Emitida pela Pulse">Emitida pela Pulse</option>', to: '<option value="Emitida pela PULSE">Emitida pela PULSE</option>' },
  { from: '>Pulse</button>', to: '>PULSE</button>' },
  { from: '>Dac</button>', to: '>DAC</button>' },
  { from: 'Total Pulse', to: 'Total PULSE' },
  { from: 'Total Dac', to: 'Total DAC' },
  { from: '<option value="Pulse">Apenas Pulse</option>', to: '<option value="PULSE">Apenas PULSE</option>' },
  { from: "setGeFilterSai('DAC', this)\">Dac</button>", to: "setGeFilterSai('DAC', this)\">DAC</button>" },
  { from: "setGeFilterEnt('DAC', this)\">Dac</button>", to: "setGeFilterEnt('DAC', this)\">DAC</button>" },
  { from: "setMonitorFilter('Pulse', this)\">Pulse</button>", to: "setMonitorFilter('PULSE', this)\">PULSE</button>" },
  { from: "setMonitorFilter('DAC', this)\">DAC</button>", to: "setMonitorFilter('DAC', this)\">DAC</button>" }
];

let modifiedContent = content;
for (const req of replacements) {
  // Use global regex replace to catch all instances
  const regex = new RegExp(req.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  modifiedContent = modifiedContent.replace(regex, req.to);
}

fs.writeFileSync(filePath, modifiedContent, 'utf8');
console.log('Replacements applied');
