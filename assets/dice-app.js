// Dice Calculator App

// Define dice data
const SkirmishDie = {
  sides: [
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
  ]
};

const AssaultDie = {
  sides: [
    { count: { hit: 0, miss: 1, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 0, intercept: 1, buildinghit: 0 } },
    { count: { hit: 2, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 2, miss: 0, key: 0, selfhit: 0, intercept: 0, buildinghit: 0 } },
    { count: { hit: 1, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 0 } },
  ]
};

const RaidDie = {
  sides: [
    { count: { hit: 0, miss: 0, key: 2, selfhit: 0, intercept: 1, buildinghit: 0 } },
    { count: { hit: 0, miss: 0, key: 1, selfhit: 1, intercept: 0, buildinghit: 0 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 0, intercept: 1, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 1, selfhit: 0, intercept: 0, buildinghit: 1 } },
    { count: { hit: 0, miss: 0, key: 0, selfhit: 1, intercept: 0, buildinghit: 1 } },
  ]
};

// Selected faces for assault rerolls
const selectedAssaultFaces = new Set([0, 1, 5]); // Faces 1, 2 and 6 enabled by default

// Selected faces for raid rerolls
const selectedRaidFaces = new Set([2, 3, 5]); // Faces 3, 4, 6 enabled by default

// Selected faces for empath rerolls (separate for each die type)
const selectedAssaultEmpathFaces = new Set([0, 1, 5]); // Faces 1, 2, 6 enabled by default for assault
const selectedSkirmishEmpathFaces = new Set([0]); // Faces 1, 2, 3 enabled by default for skirmish
const selectedRaidEmpathFaces = new Set([0, 5]); // Faces 1, 2, 6 enabled by default for raid

// Priority order for assault faces (0-5, higher index = lower priority)
let assaultFacePriority = [0, 1, 5, 2, 3, 4]; // Faces 1,2,6,3,4,5

// Priority order for raid faces (0-5, higher index = lower priority)
let raidFacePriority = [2, 3, 5, 1, 4, 0]; // Faces 3,4,6,2,5,1

// Total rolled icons across multiple rolls
let totalRolled = { hit: 0, selfhit: 0, intercept: 0, key: 0, buildinghit: 0 };

// Count icons from currently displayed dice faces
function countRolledIcons() {
  // Check if any dice still have letter overlays (haven't been rolled)
  const allDice = [
    ...Array.from(document.querySelectorAll('.assault-visual')).flatMap(v => Array.from(v.children)),
    ...Array.from(document.querySelectorAll('.skirmish-visual')).flatMap(v => Array.from(v.children)),
    ...Array.from(document.querySelectorAll('.raid-visual')).flatMap(v => Array.from(v.children))
  ];
  
  const hasUnrolledDice = allDice.some(die => die.querySelector('.dice-text-overlay'));
  
  if (hasUnrolledDice) {
    // Return 0 for all icons if any dice haven't been rolled
    return {
      hit: 0,
      selfhit: 0,
      intercept: 0,
      key: 0,
      buildinghit: 0
    };
  }

  const iconCounts = {
    hit: 0,
    selfhit: 0,
    intercept: 0,
    key: 0,
    buildinghit: 0
  };

  // Count from assault dice
  document.querySelectorAll('.assault-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const faceIndex = parseInt(die.dataset.faceIndex);
      if (!isNaN(faceIndex) && AssaultDie.sides[faceIndex]) {
        const side = AssaultDie.sides[faceIndex];
        Object.keys(iconCounts).forEach(icon => {
          iconCounts[icon] += side.count[icon] || 0;
        });
      }
    });
  });

  // Count from skirmish dice
  document.querySelectorAll('.skirmish-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const faceIndex = parseInt(die.dataset.faceIndex);
      if (!isNaN(faceIndex) && SkirmishDie.sides[faceIndex]) {
        const side = SkirmishDie.sides[faceIndex];
        Object.keys(iconCounts).forEach(icon => {
          iconCounts[icon] += side.count[icon] || 0;
        });
      }
    });
  });

  // Count from raid dice
  document.querySelectorAll('.raid-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const faceIndex = parseInt(die.dataset.faceIndex);
      if (!isNaN(faceIndex) && RaidDie.sides[faceIndex]) {
        const side = RaidDie.sides[faceIndex];
        Object.keys(iconCounts).forEach(icon => {
          iconCounts[icon] += side.count[icon] || 0;
        });
      }
    });
  });

  // Apply intercept modifiers
  let effectiveIntercept = iconCounts.intercept;
  if (document.getElementById('signalBreaker').checked) {
    effectiveIntercept = Math.max(0, effectiveIntercept - 1);
  }
  const assaultDiceCount = Array.from(document.querySelectorAll('.assault-visual')).reduce((sum, v) => sum + v.children.length, 0);
  if (document.getElementById('mirrorPlating').checked && assaultDiceCount > 0) {
    effectiveIntercept += 1;
  }
  iconCounts.intercept = effectiveIntercept;

  const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
  if (iconCounts.intercept > 0) {
    iconCounts.selfhit += multiplier;
  }

  return iconCounts;
}

// Helper function to round numbers
function round(num, toPercent = false) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  if (toPercent) {
    num = num * 100;
  }
  let res = formatter.format(num);
  return res;
}

// Compute expected value for an icon
function computeExpectedValue(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount) {
  // Use PMF for all icons so rerolls are accounted for consistently
  const pmf = computePMF(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount);
  let expected = 0;
  for (let i = 0; i < pmf.length; i++) {
    expected += i * pmf[i];
  }
  return expected;
}

// Update results display automatically
function updateResults() {
  const assault = Array.from(document.querySelectorAll('.assault-visual')).reduce((sum, v) => sum + v.children.length, 0);
  const skirmish = Array.from(document.querySelectorAll('.skirmish-visual')).reduce((sum, v) => sum + v.children.length, 0);
  const raid = Array.from(document.querySelectorAll('.raid-visual')).reduce((sum, v) => sum + v.children.length, 0);
  
  // Get current threshold from existing dropdown if it exists, otherwise default to 1
  const existingThresholdSelect = document.getElementById('thresholdSelect');
  const threshold = existingThresholdSelect ? parseInt(existingThresholdSelect.value) : 1;

  // Get current operator from existing dropdown if it exists, otherwise default to gte
  const existingOperatorSelect = document.getElementById('operatorSelect');
  const operator = existingOperatorSelect ? existingOperatorSelect.value : 'gte';

  // Define all icon types with their display names and image paths
  const allIcons = [
    { key: 'hit', name: 'Hits', image: './dice/images/hit.png' },
    { key: 'selfhit', name: 'Self hits', image: './dice/images/selfhit.png' },
    { key: 'intercept', name: 'Intercept', image: './dice/images/intercept.png' },
    { key: 'key', name: 'Keys', image: './dice/images/key.png' },
    { key: 'buildinghit', name: 'Building Hits', image: './dice/images/buildinghit.png' }
  ];

  // Calculate total dice count and rolled icon counts
  const totalDice = assault + skirmish + raid;
  const rolledIcons = countRolledIcons();
  
  // Check if any dice are unrolled
  const allDice = [
    ...Array.from(document.querySelectorAll('.assault-visual')).flatMap(v => Array.from(v.children)),
    ...Array.from(document.querySelectorAll('.skirmish-visual')).flatMap(v => Array.from(v.children)),
    ...Array.from(document.querySelectorAll('.raid-visual')).flatMap(v => Array.from(v.children))
  ];
  const hasUnrolledDice = allDice.some(die => die.querySelector('.dice-text-overlay'));

  // Generate results for all icons
  const results = allIcons.map(icon => {
    const expected = computeExpectedValue(icon.key, assault, skirmish, raid);
    // Compute PMF for both probability and chart
    const pmf = computePMF(icon.key, assault, skirmish, raid);
    const prob = operator === 'gte' ? pmf.slice(threshold).reduce((sum, p) => sum + p, 0) : pmf.slice(0, threshold + 1).reduce((sum, p) => sum + p, 0);
    const percent = round(prob, true);
    const rolledCount = totalRolled[icon.key] || 0;

    // Compute PMF for chart
    const maxProb = Math.max(...pmf);
    const chartBars = pmf.map((p, i) => {
      const height = maxProb > 0 ? (p / maxProb) * 20 : 0; // 20px max height
      return `<div class="pmf-bar" style="height: ${height}px;" title="${i}: ${(p * 100).toFixed(1)}%"></div>`;
    }).join('');

    return `
      <div class="icon-result">
        <div class="result-ev">${round(expected)}</div>
        <img src="${icon.image}" alt="${icon.name}" class="result-icon">
        <div class="result-chance">${percent}%</div>
        <div class="result-rolled">${rolledCount === 0 ? '-' : rolledCount}${!hasUnrolledDice && rolledCount > 0 ? ' <img src="' + icon.image + '" alt="' + icon.name + '" class="result-rolled-icon">' : ''}</div>
      </div>
    `;
  }).join('');

  resultEl.innerHTML = `
    <div class="results-table">
      <div class="results-header">
        <div class="header-ev">EV</div>
        <div class="header-icon">Icon</div>
        <div class="header-chance">
          Chance
          <select id="operatorSelect" class="header-select">
            <option value="gte">≥</option>
            <option value="lte">≤</option>
          </select>
          <select id="thresholdSelect" class="header-select">
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="13">13</option>
            <option value="14">14</option>
            <option value="15">15</option>
          </select>
        </div>
        <div class="header-rolled">Rolled</div>
      </div>
      ${results}
    </div>
  `;

  // Re-attach the event listeners to the newly created dropdowns
  const newOperatorSelect = document.getElementById('operatorSelect');
  newOperatorSelect.value = operator;
  newOperatorSelect.addEventListener('change', updateResults);

  const newThresholdSelect = document.getElementById('thresholdSelect');
  newThresholdSelect.value = threshold;
  newThresholdSelect.addEventListener('change', updateResults);

  // Show/hide clear buttons based on dice count
  document.querySelectorAll('.assault-clear').forEach(btn => btn.style.display = assault > 0 ? 'flex' : 'none');
  document.querySelectorAll('.skirmish-clear').forEach(btn => btn.style.display = skirmish > 0 ? 'flex' : 'none');
  document.querySelectorAll('.raid-clear').forEach(btn => btn.style.display = raid > 0 ? 'flex' : 'none');

  // Update bell curves section
  const bellCurvesEl = document.getElementById('bellCurvesSection');
  const existingMode = document.getElementById('histogramMode')?.value || 'exact';
  const bellCurves = allIcons.map(icon => {
    const pmf = computePMF(icon.key, assault, skirmish, raid);
    
    // Convert PMF based on mode
    let displayPMF = pmf;
    if (existingMode === 'atleast') {
      displayPMF = pmf.map((_, i) => computeProbabilityAtLeastN(icon.key, assault, skirmish, raid, i));
    } else if (existingMode === 'atmost') {
      displayPMF = pmf.map((_, i) => pmf.slice(0, i + 1).reduce((sum, p) => sum + p, 0));
    }
    
    // Skip leading/trailing based on mode
    let chartPMF = displayPMF;
    let offset = 0;
    while (chartPMF.length > 0 && chartPMF[0] === 0) {
      chartPMF = chartPMF.slice(1);
      offset++;
    }
    // Trim trailing zeros
    while (chartPMF.length > 0 && chartPMF[chartPMF.length - 1] === 0) {
      chartPMF.pop();
    }
    
    const maxProb = Math.max(...chartPMF);
    
    // Always show the chart
    
    // Calculate bar width based on number of bars and available space
    const numBars = chartPMF.length;
    const maxTotalWidth = 600; // Maximum total width for all bars in pixels
    const minBarWidth = 30; // Minimum bar width
    const maxBarWidth = 120; // Maximum bar width
    
    let barWidth;
    if (numBars * maxBarWidth <= maxTotalWidth) {
      // If all bars can fit at max width, use max width
      barWidth = maxBarWidth;
    } else if (numBars * minBarWidth <= maxTotalWidth) {
      // If bars can fit at min width, distribute space evenly
      barWidth = Math.floor(maxTotalWidth / numBars);
    } else {
      // If even min width is too much, use min width (chart will scroll)
      barWidth = minBarWidth;
    }
    
    barWidth = `${barWidth}px`;
    
    const chartBars = chartPMF.map((p, idx) => {
      const i = idx + offset;
      const height = maxProb > 0 ? (p / maxProb) * 120 : 0; // 120px max height
      const percent = (p * 100).toFixed(1);
      const tooltipPercent = (p * 100).toFixed(3);
      const label = existingMode === 'atleast' ? `≥${i}` : existingMode === 'atmost' ? `≤${i}` : i;
      return `
        <div class="bell-curve-bar-container" style="width: ${barWidth};">
          <div class="bell-curve-bar" style="height: ${height}px;" title="${i}: ${tooltipPercent}%"></div>
          <div class="bell-curve-label">${label}</div>
          <div class="bell-curve-percent">${percent}%</div>
        </div>
      `;
    }).join('');

    return `
      <div class="bell-curve-item">
        <div class="bell-curve-header">
          <img src="${icon.image}" alt="${icon.name}" class="bell-curve-icon">
          <span>${icon.name}</span>
        </div>
        <div class="bell-curve-chart" style="display: flex; justify-content: center;">${chartBars}</div>
      </div>
    `;
  }).join('');

  bellCurvesEl.innerHTML = `
    <div class="bell-curves-header">
      <h3 class="bell-curves-title">Probability Distributions</h3>
      <label class="histogram-mode">
        <span>Mode:</span>
        <select id="histogramMode">
          <option value="exact">Exact</option>
          <option value="atleast">At Least</option>
          <option value="atmost">At Most</option>
        </select>
      </label>
    </div>
    <div class="bell-curves-container">${bellCurves}</div>
  `;
  // Set the mode and add listener
  const histogramMode = document.getElementById('histogramMode');
  histogramMode.value = existingMode;
  histogramMode.addEventListener('change', updateResults);
  bellCurvesEl.style.display = 'block';

  // Update custom probability calculator
  const customProbEl = document.getElementById('customProbSection');
  if (isAdvancedMode) {
    // Store current input values before re-rendering
    const currentValues = {};
    allIcons.forEach(icon => {
      const minInput = document.getElementById(`min-${icon.key}`);
      const maxInput = document.getElementById(`max-${icon.key}`);
      if (minInput && maxInput) {
        currentValues[icon.key] = {
          min: minInput.value,
          max: maxInput.value
        };
      }
    });

    customProbEl.innerHTML = `
      <div class="custom-prob-container">
        ${allIcons.map(icon => `
          <div class="custom-prob-row">
            <img src="${icon.image}" alt="${icon.name}" class="custom-prob-icon">
            <span class="custom-prob-name">${icon.name}</span>
            <label>Min:</label>
            <select id="min-${icon.key}" class="custom-prob-input">
              ${Array.from({length: 21}, (_, i) => `<option value="${i}" ${currentValues[icon.key]?.min == i ? 'selected' : ''}>${i}</option>`).join('')}
            </select>
            <label>Max:</label>
            <select id="max-${icon.key}" class="custom-prob-input">
              ${Array.from({length: 21}, (_, i) => `<option value="${i}" ${currentValues[icon.key]?.max == i ? 'selected' : ''}>${i}</option>`).join('')}
              <option value="999" ${currentValues[icon.key]?.max == 999 ? 'selected' : 'selected'}>&infin;</option>
            </select>
            <span class="custom-prob-result" id="result-${icon.key}">0%</span>
          </div>
        `).join('')}
      </div>
      <div class="custom-prob-combined">
        <button id="calculateCombined" class="btn-calculate">Calculate Combined Probability</button>
        <span id="combinedResult">0%</span>
      </div>
    `;

    // Add event listeners for custom probability inputs
    allIcons.forEach(icon => {
      const minInput = document.getElementById(`min-${icon.key}`);
      const maxInput = document.getElementById(`max-${icon.key}`);
      const resultEl = document.getElementById(`result-${icon.key}`);

      const updateCustomProb = () => {
        const min = parseInt(minInput.value) || 0;
        const max = parseInt(maxInput.value) || 0;
        const pmf = computePMF(icon.key, assault, skirmish, raid);
        let prob = 0;
        for (let i = Math.max(0, min); i <= Math.min(max, pmf.length - 1); i++) {
          prob += pmf[i];
        }
        resultEl.textContent = round(prob, true) + '%';
      };

      minInput.addEventListener('input', updateCustomProb);
      maxInput.dataset.first = 'true';
      maxInput.addEventListener('input', () => {
        if (maxInput.dataset.first === 'true') {
          const val = parseInt(maxInput.value) || 0;
          if (val < 999) {
            maxInput.value = '0';
          } else if (val > 999) {
            maxInput.value = '1';
          }
          maxInput.dataset.first = 'false';
        }
        updateCustomProb();
      });
      // Initial update
      updateCustomProb();
    });

    // Function to update combined probability
    const updateCombined = () => {
      const numInputEl = document.getElementById('numSimulationsInput');
      const numSimulations = numInputEl ? Math.max(1000, parseInt(numInputEl.value) || 40000) : 40000;
      let successCount = 0;

      const skirmishRerolls = parseInt(document.getElementById('skirmishRerolls').value) || 0;
      const assaultRerolls = parseInt(document.getElementById('assaultRerolls').value) || 0;
      const raidRerolls = parseInt(document.getElementById('raidRerolls').value) || 0;
      const empathVision = document.getElementById('empathVision').checked;

      // Get min/max for each icon
      const ranges = {};
      allIcons.forEach(icon => {
        const min = parseInt(document.getElementById(`min-${icon.key}`).value) || 0;
        const max = parseInt(document.getElementById(`max-${icon.key}`).value) || 0;
        ranges[icon.key] = { min, max };
      });

      // Prepare dice pools
      const dicePools = [
        { type: 'assault', count: assault, die: AssaultDie },
        { type: 'skirmish', count: skirmish, die: SkirmishDie },
        { type: 'raid', count: raid, die: RaidDie }
      ];

      console.debug('Combined calc config', {
        assault, skirmish, raid,
        assaultRerolls, skirmishRerolls, raidRerolls,
        selectedAssaultFaces: Array.from(selectedAssaultFaces),
        selectedRaidFaces: Array.from(selectedRaidFaces),
        selectedAssaultEmpathFaces: Array.from(selectedAssaultEmpathFaces),
        selectedSkirmishEmpathFaces: Array.from(selectedSkirmishEmpathFaces),
        selectedRaidEmpathFaces: Array.from(selectedRaidEmpathFaces),
        raidFacePriority,
        assaultFacePriority
      });

      const iconSuccessCounts = {};
      allIcons.forEach(icon => iconSuccessCounts[icon.key] = 0);

      // (no in-page sample logs)

      for (let sim = 0; sim < numSimulations; sim++) {
        const totals = { hit: 0, selfhit: 0, intercept: 0, key: 0, buildinghit: 0 };
        const assaultResults = [];
        const skirmishResults = [];
        const raidResults = [];

        // Roll all dice
        dicePools.forEach(pool => {
          for (let d = 0; d < pool.count; d++) {
            const faceIndex = Math.floor(Math.random() * 6);
            const face = pool.die.sides[faceIndex];
            if (pool.type === 'assault') {
              assaultResults.push({ faceIndex, count: face.count });
            } else if (pool.type === 'skirmish') {
              skirmishResults.push(face.count);
            } else if (pool.type === 'raid') {
              raidResults.push({ faceIndex, count: face.count });
            }
          }
        });

        // Sequential rerolls: 1) Empath's Vision (global) 2) Targeted rerolls (assault, raid, skirmish)
        // Apply Empath rerolls first so targeted reroll candidate selection uses Empath results
        const beforeEmpathSnapshot = {
          assault: assaultResults.map(r => r.faceIndex),
          skirmish: skirmishResults.map(f => {
            return SkirmishDie.sides.findIndex(s => s.count.hit === f.hit && s.count.selfhit === f.selfhit);
          }),
          raid: raidResults.map(r => r.faceIndex)
        };

        if (empathVision) {
          // Assault empath rerolls
          assaultResults.forEach((result, i) => {
            if (selectedAssaultEmpathFaces.has(result.faceIndex)) {
              const newFaceIndex = Math.floor(Math.random() * 6);
              const newFace = AssaultDie.sides[newFaceIndex];
              assaultResults[i] = { faceIndex: newFaceIndex, count: newFace.count };
            }
          });

          // Skirmish empath rerolls
          skirmishResults.forEach((face, i) => {
            const faceIndex = SkirmishDie.sides.findIndex(s => s.count.hit === face.hit && s.count.selfhit === face.selfhit);
            if (selectedSkirmishEmpathFaces.has(faceIndex)) {
              const newFace = SkirmishDie.sides[Math.floor(Math.random() * 6)];
              skirmishResults[i] = newFace.count;
            }
          });

          // Raid empath rerolls
          raidResults.forEach((result, i) => {
            if (selectedRaidEmpathFaces.has(result.faceIndex)) {
              const newFaceIndex = Math.floor(Math.random() * 6);
              const newFace = RaidDie.sides[newFaceIndex];
              raidResults[i] = { faceIndex: newFaceIndex, count: newFace.count };
            }
          });
        }

        const afterEmpathSnapshot = {
          assault: assaultResults.map(r => r.faceIndex),
          skirmish: skirmishResults.map(f => {
            return SkirmishDie.sides.findIndex(s => s.count.hit === f.hit && s.count.selfhit === f.selfhit);
          }),
          raid: raidResults.map(r => r.faceIndex)
        };

        if (sim < 3) console.debug('empath reroll sample', { sim, beforeEmpathSnapshot, afterEmpathSnapshot });

        // Now perform targeted rerolls in a defined sequence: assault -> raid -> skirmish

        // Assault targeted rerolls (Seeker)
        const assaultCandidates = [];
        assaultResults.forEach((result, i) => {
          if (selectedAssaultFaces.has(result.faceIndex)) assaultCandidates.push(i);
        });
        assaultCandidates.sort((a, b) => assaultFacePriority.indexOf(assaultResults[a].faceIndex) - assaultFacePriority.indexOf(assaultResults[b].faceIndex));
        const assaultRerolled = assaultCandidates.slice(0, assaultRerolls);
        assaultRerolled.forEach(i => {
          const newFaceIndex = Math.floor(Math.random() * 6);
          const newFace = AssaultDie.sides[newFaceIndex];
          assaultResults[i] = { faceIndex: newFaceIndex, count: newFace.count };
        });
        if (sim < 3) console.debug('assault reroll sample', { sim, assaultCandidates, assaultRerolled });

        // Raid targeted rerolls (Corsair)
        const raidCandidates = [];
        raidResults.forEach((result, i) => {
          if (selectedRaidFaces.has(result.faceIndex)) raidCandidates.push(i);
        });
        raidCandidates.sort((a, b) => raidFacePriority.indexOf(raidResults[a].faceIndex) - raidFacePriority.indexOf(raidResults[b].faceIndex));
        const raidRerolled = raidCandidates.slice(0, raidRerolls);
        raidRerolled.forEach(i => {
          const newFaceIndex = Math.floor(Math.random() * 6);
          const newFace = RaidDie.sides[newFaceIndex];
          raidResults[i] = { faceIndex: newFaceIndex, count: newFace.count };
        });
        if (sim < 3) console.debug('raid reroll sample', { sim, raidCandidates, raidRerolled });

        // Skirmish targeted rerolls (reroll misses)
        let remainingSkirmishRerolls = skirmishRerolls;
        const skirmishRerolledIdx = [];
        for (let i = 0; i < skirmishResults.length && remainingSkirmishRerolls > 0; i++) {
          if (skirmishResults[i].hit === 0) {
            const newFace = SkirmishDie.sides[Math.floor(Math.random() * 6)];
            skirmishResults[i] = newFace.count;
            skirmishRerolledIdx.push(i);
            remainingSkirmishRerolls--;
          }
        }
        if (sim < 3) console.debug('skirmish reroll sample', { sim, skirmishRerolledIdx });

        // Sum assault results
        assaultResults.forEach(result => {
          Object.keys(totals).forEach(icon => {
            totals[icon] += result.count[icon] || 0;
          });
        });

        // Sum skirmish results
        skirmishResults.forEach(face => {
          Object.keys(totals).forEach(icon => {
            totals[icon] += face[icon] || 0;
          });
        });

        // Sum raid results
        raidResults.forEach(result => {
          Object.keys(totals).forEach(icon => {
            totals[icon] += result.count[icon] || 0;
          });
        });

        // Apply intercept modifiers
        let effectiveIntercept = totals.intercept;
        if (document.getElementById('signalBreaker').checked) {
          effectiveIntercept = Math.max(0, effectiveIntercept - 1);
        }
        if (document.getElementById('mirrorPlating').checked) {
          effectiveIntercept += 1;
        }
        totals.intercept = effectiveIntercept;

        const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
        if (totals.intercept > 0) {
          totals.selfhit += multiplier;
        }

        // Track per-icon condition satisfaction and combined condition
        let allMet = true;
        for (const icon of allIcons) {
          const { min, max } = ranges[icon.key];
          const met = totals[icon.key] >= min && totals[icon.key] <= max;
          if (met) iconSuccessCounts[icon.key]++;
          if (!met) allMet = false;
        }
        if (allMet) successCount++;
      }

      // Compute simulated marginal probabilities and compare to PMF-derived marginals
      const simulatedMarginals = {};
      allIcons.forEach(icon => {
        simulatedMarginals[icon.key] = iconSuccessCounts[icon.key] / numSimulations;
      });

      const pmfMarginals = {};
      allIcons.forEach(icon => {
        const pmf = computePMF(icon.key, assault, skirmish, raid);
        const { min, max } = ranges[icon.key];
        let p = 0;
        for (let i = Math.max(0, min); i <= Math.min(max, pmf.length - 1); i++) p += pmf[i] || 0;
        pmfMarginals[icon.key] = p;
      });

      console.debug('combined marginal comparison', { simulatedMarginals, pmfMarginals });

      // Also render a visible debug panel under the custom probability section
      console.debug('combined marginal comparison', { simulatedMarginals, pmfMarginals });

      const p = successCount / numSimulations;
      const se = Math.sqrt(p * (1 - p) / numSimulations);
      const ci95 = 1.96 * se;
      const combinedEl = document.getElementById('combinedResult');
      combinedEl.textContent = `${round(p, true)}%`;
      combinedEl.title = `95% CI ±${round(ci95, true)}% (N=${numSimulations})`;
    };

    // Add event listener for combined calculation button (optional, since auto-updates)
    document.getElementById('calculateCombined').addEventListener('click', updateCombined);
  } else {
    customProbEl.innerHTML = '';
  }
}

// Compute skirmish PMF with rerolls
function computeSkirmishPMF(icon, numDice, numRerolls, empathFaces = new Set()) {
  if (numDice === 0) return [1];
  
  // Calculate effective probabilities after Empath's Vision rerolls (at most once)
  const effectiveProbs = new Array(6).fill(0);
  const selectedCount = empathFaces.size;
  
  if (selectedCount > 0) {
    // Empath's Vision active: selected faces reroll once
    const initialProb = 1/6;
    const rerollProb = selectedCount / 6 * (1/6); // Probability of selecting a face that gets rerolled, then landing on this face
    
    for (let i = 0; i < 6; i++) {
      if (!empathFaces.has(i)) {
        // Non-selected faces: initial probability + reroll probability
        effectiveProbs[i] = initialProb + rerollProb;
      } else {
        // Selected faces: only from rerolls (since they get rerolled away initially)
        effectiveProbs[i] = rerollProb;
      }
    }
  } else {
    // No Empath's Vision
    for (let i = 0; i < 6; i++) {
      effectiveProbs[i] = 1/6;
    }
  }
  
  const maxValue = Math.max(...SkirmishDie.sides.map(side => side.count[icon])) * numDice;
  const dp = Array(numDice + 1).fill().map(() => Array(numRerolls + 1).fill().map(() => Array(maxValue + 1).fill(0)));
  dp[0][numRerolls][0] = 1;
  for (let d = 0; d < numDice; d++) {
    for (let r = 0; r <= numRerolls; r++) {
      for (let v = 0; v <= maxValue; v++) {
        if (dp[d][r][v] === 0) continue;
        
        // For each possible face, use effective probabilities
        for (let f = 0; f < 6; f++) {
          const face = SkirmishDie.sides[f];
          const hasHit = face.count.hit > 0;
          const value = face.count[icon];
          const prob = effectiveProbs[f];
          
          if (hasHit) {
            // Hit - no reroll
            if (v + value <= maxValue) {
              dp[d+1][r][v + value] += dp[d][r][v] * prob;
            }
          } else {
            // Miss - check for reroll
            if (r > 0) {
              // Reroll miss
                for (let g = 0; g < 6; g++) {
                const rerollFace = SkirmishDie.sides[g];
                const rerollValue = rerollFace.count[icon];
                const rerollProb = 1/6; // Rerolls are fresh rolls (Empath does not apply to rerolls)
                if (v + rerollValue <= maxValue) {
                  dp[d+1][r-1][v + rerollValue] += dp[d][r][v] * prob * rerollProb;
                }
              }
            } else {
              // No reroll
              if (v + value <= maxValue) {
                dp[d+1][r][v] += dp[d][r][v] * prob;
              }
            }
          }
        }
      }
    }
  }
  const pmf = Array(maxValue + 1).fill(0);
  for (let r = 0; r <= numRerolls; r++) {
    for (let v = 0; v <= maxValue; v++) {
      pmf[v] += dp[numDice][r][v];
    }
  }
  return pmf;
}

// Compute assault PMF with rerolls for selected faces
function computeAssaultPMF(icon, numDice, numRerolls, selectedFaces, empathFaces = new Set()) {
  if (numDice === 0) return [1];
  
  // Calculate effective probabilities after Empath's Vision rerolls (at most once)
  const effectiveProbs = new Array(6).fill(0);
  const selectedCount = empathFaces.size;
  const nonSelectedCount = 6 - selectedCount;
  
  if (selectedCount > 0) {
    // Empath's Vision active: selected faces reroll once
    const initialProb = 1/6;
    const rerollProb = selectedCount / 6 * (1/6); // Probability of selecting a face that gets rerolled, then landing on this face
    
    for (let i = 0; i < 6; i++) {
      if (!empathFaces.has(i)) {
        // Non-selected faces: initial probability + reroll probability
        effectiveProbs[i] = initialProb + rerollProb;
      } else {
        // Selected faces: only from rerolls (since they get rerolled away initially)
        effectiveProbs[i] = rerollProb;
      }
    }
  } else {
    // No Empath's Vision
    for (let i = 0; i < 6; i++) {
      effectiveProbs[i] = 1/6;
    }
  }
  
  const maxValue = Math.max(...AssaultDie.sides.map(side => side.count[icon])) * numDice;
  const dp = Array(numDice + 1).fill().map(() => Array(numRerolls + 1).fill().map(() => Array(maxValue + 1).fill(0)));
  dp[0][numRerolls][0] = 1;
  for (let d = 0; d < numDice; d++) {
    for (let r = 0; r <= numRerolls; r++) {
      for (let v = 0; v <= maxValue; v++) {
        if (dp[d][r][v] === 0) continue;
        for (let f = 0; f < 6; f++) {
          const face = AssaultDie.sides[f];
          const value = face.count[icon];
          const prob = effectiveProbs[f];
          if (selectedFaces.has(f) && r > 0) {
            // Seeker Torpedoes reroll
            for (let g = 0; g < 6; g++) {
              const rerollFace = AssaultDie.sides[g];
              const rerollValue = rerollFace.count[icon];
              const rerollProb = 1/6; // Rerolls are fresh rolls (Empath does not apply to rerolls)
              if (v + rerollValue <= maxValue) {
                dp[d+1][r-1][v + rerollValue] += dp[d][r][v] * prob * rerollProb;
              }
            }
          } else {
            // No Seeker Torpedoes reroll
            if (v + value <= maxValue) {
              dp[d+1][r][v + value] += dp[d][r][v] * prob;
            }
          }
        }
      }
    }
  }
  const pmf = Array(maxValue + 1).fill(0);
  for (let r = 0; r <= numRerolls; r++) {
    for (let v = 0; v <= maxValue; v++) {
      pmf[v] += dp[numDice][r][v];
    }
  }
  return pmf;
}

// Compute raid PMF with rerolls for selected faces
function computeRaidPMF(icon, numDice, numRerolls, selectedFaces, empathFaces = new Set()) {
  if (numDice === 0) return [1];

  // Calculate effective probabilities after Empath's Vision rerolls (at most once)
  const effectiveProbs = new Array(6).fill(0);
  const selectedCount = empathFaces.size;
  if (selectedCount > 0) {
    const initialProb = 1/6;
    const rerollProb = selectedCount / 6 * (1/6);
    for (let i = 0; i < 6; i++) {
      if (!empathFaces.has(i)) {
        effectiveProbs[i] = initialProb + rerollProb;
      } else {
        effectiveProbs[i] = rerollProb;
      }
    }
  } else {
    for (let i = 0; i < 6; i++) effectiveProbs[i] = 1/6;
  }

  const maxValue = Math.max(...RaidDie.sides.map(side => side.count[icon])) * numDice;
  const dp = Array(numDice + 1).fill().map(() => Array(numRerolls + 1).fill().map(() => Array(maxValue + 1).fill(0)));
  dp[0][numRerolls][0] = 1;
  for (let d = 0; d < numDice; d++) {
    for (let r = 0; r <= numRerolls; r++) {
      for (let v = 0; v <= maxValue; v++) {
        if (dp[d][r][v] === 0) continue;
        for (let f = 0; f < 6; f++) {
          const face = RaidDie.sides[f];
          const value = face.count[icon];
          const prob = effectiveProbs[f];
          if (selectedFaces.has(f) && r > 0) {
            // Corsair reroll: reroll into any face using effective probs
            for (let g = 0; g < 6; g++) {
              const rerollFace = RaidDie.sides[g];
              const rerollValue = rerollFace.count[icon];
              const rerollProb = 1/6; // Rerolls are fresh rolls (Empath does not apply to rerolls)
              if (v + rerollValue <= maxValue) {
                dp[d+1][r-1][v + rerollValue] += dp[d][r][v] * prob * rerollProb;
              }
            }
          } else {
            // No reroll
            if (v + value <= maxValue) {
              dp[d+1][r][v + value] += dp[d][r][v] * prob;
            }
          }
        }
      }
    }
  }
  const pmf = Array(maxValue + 1).fill(0);
  for (let r = 0; r <= numRerolls; r++) {
    for (let v = 0; v <= maxValue; v++) {
      pmf[v] += dp[numDice][r][v];
    }
  }
  return pmf;
}

function convolvePMF(pmf1, pmf2) {
  const result = Array(pmf1.length + pmf2.length - 1).fill(0);
  for (let i = 0; i < pmf1.length; i++) {
    for (let j = 0; j < pmf2.length; j++) {
      result[i + j] += pmf1[i] * pmf2[j];
    }
  }
  return result;
}



function updateProbabilitiesFromPMF(P, diePMF, diceCount) {
  for (let i = 1; i <= diceCount; i++) {
    const maxSide = Math.max(...Object.keys(diePMF).map(Number));
    const newP = Array(P.length + maxSide).fill(0);
    for (let s = 0; s < P.length; s++) {
      for (const [side, prob] of Object.entries(diePMF)) {
        const sideNum = parseInt(side);
        newP[s + sideNum] += prob * P[s];
      }
    }
    P = newP;
  }
  return P;
}

// Compute probability mass function for an icon
function computePMF(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount) {
  if (icon === 'selfhit') {
    const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
    const empathVision = document.getElementById('empathVision').checked;
    const assaultRerolls = parseInt(document.getElementById('assaultRerolls').value) || 0;
    const raidRerolls = parseInt(document.getElementById('raidRerolls').value) || 0;
    
    // Compute base selfhit PMF with rerolls
    const baseAssaultPMF = assaultDiceCount > 0 ? computeAssaultPMF('selfhit', assaultDiceCount, assaultRerolls, selectedAssaultFaces, empathVision ? selectedAssaultEmpathFaces : new Set()) : [1];
    const baseRaidPMF = raidDiceCount > 0 ? computeRaidPMF('selfhit', raidDiceCount, raidRerolls, selectedRaidFaces, empathVision ? selectedRaidEmpathFaces : new Set()) : [1];
    const basePMF = convolvePMF(baseAssaultPMF, baseRaidPMF);
    const baseMaxSum = basePMF.length - 1;

    // Compute intercept PMF
    const interceptPMF = computePMF('intercept', assaultDiceCount, 0, raidDiceCount);
    const interceptMaxSum = interceptPMF.length - 1;

    // Apply modifiers to intercept PMF
    if (document.getElementById('signalBreaker').checked) {
      // Approximate: reduce by 1
      const newInterceptPMF = Array(interceptMaxSum + 1).fill(0);
      for (let s = 0; s <= interceptMaxSum; s++) {
        if (s > 0) {
          newInterceptPMF[s - 1] += interceptPMF[s];
        } else {
          newInterceptPMF[0] += interceptPMF[0];
        }
      }
      for (let s = 0; s <= interceptMaxSum; s++) {
        interceptPMF[s] = newInterceptPMF[s];
      }
    }
    if (document.getElementById('mirrorPlating').checked) {
      // Shift by +1
      const newInterceptPMF = Array(interceptMaxSum + 2).fill(0);
      for (let s = 0; s <= interceptMaxSum; s++) {
        newInterceptPMF[s + 1] += interceptPMF[s];
      }
      interceptPMF.length = interceptMaxSum + 2;
      for (let s = 0; s < interceptPMF.length; s++) {
        interceptPMF[s] = newInterceptPMF[s];
      }
    }

    const p = 1 - (interceptPMF[0] || 0);
    const newPMF = Array(baseMaxSum + multiplier + 1).fill(0);
    for (let s = 0; s <= baseMaxSum; s++) {
      newPMF[s] += basePMF[s] * (1 - p);
      newPMF[s + multiplier] += basePMF[s] * p;
    }
    return newPMF;
  }

  if (icon === 'hit') {
    const skirmishRerolls = parseInt(document.getElementById('skirmishRerolls').value) || 0;
    const assaultRerolls = parseInt(document.getElementById('assaultRerolls').value) || 0;
    const empathVision = document.getElementById('empathVision').checked;
    const pmfFunc = (sides) => {
      const counts = {};
      const probabilities = {};
      const totalSides = sides.length;
      sides.forEach(side => {
        counts[side] = (counts[side] || 0) + 1;
      });
      for (const [side, count] of Object.entries(counts)) {
        probabilities[parseInt(side)] = count / totalSides;
      }
      return probabilities;
    };

    let resultPMF = [1];
    if (assaultDiceCount > 0) {
      const assaultPMF = computeAssaultPMF('hit', assaultDiceCount, assaultRerolls, selectedAssaultFaces, empathVision ? selectedAssaultEmpathFaces : new Set());
      resultPMF = convolvePMF(resultPMF, assaultPMF);
    }
    if (skirmishDiceCount > 0) {
      const skirmishPMF = computeSkirmishPMF('hit', skirmishDiceCount, skirmishRerolls, empathVision ? selectedSkirmishEmpathFaces : new Set());
      resultPMF = convolvePMF(resultPMF, skirmishPMF);
    }
    // Raid dice don't contribute to hits
    return resultPMF;
  }

  let resultPMF = [1];
  const assaultRerolls = parseInt(document.getElementById('assaultRerolls').value) || 0;
  const skirmishRerolls = parseInt(document.getElementById('skirmishRerolls').value) || 0;
  const raidRerolls = parseInt(document.getElementById('raidRerolls').value) || 0;
  const empathVision = document.getElementById('empathVision').checked;
  
  if (assaultDiceCount > 0) {
    const assaultPMF = computeAssaultPMF(icon, assaultDiceCount, assaultRerolls, selectedAssaultFaces, empathVision ? selectedAssaultEmpathFaces : new Set());
    resultPMF = convolvePMF(resultPMF, assaultPMF);
  }
  if (skirmishDiceCount > 0) {
    const skirmishPMF = computeSkirmishPMF(icon, skirmishDiceCount, skirmishRerolls, empathVision ? selectedSkirmishEmpathFaces : new Set());
    resultPMF = convolvePMF(resultPMF, skirmishPMF);
  }
  if (raidDiceCount > 0) {
    const raidPMF = computeRaidPMF(icon, raidDiceCount, raidRerolls, selectedRaidFaces, empathVision ? selectedRaidEmpathFaces : new Set());
    resultPMF = convolvePMF(resultPMF, raidPMF);
  }

  // Apply intercept modifiers to the final PMF
  if (icon === 'intercept') {
    if (document.getElementById('signalBreaker').checked) {
      // Shift PMF down by 1 (ignore one intercept)
      const newPMF = Array(resultPMF.length).fill(0);
      for (let s = 0; s < resultPMF.length; s++) {
        if (s > 0) {
          newPMF[s - 1] += resultPMF[s];
        } else {
          newPMF[0] += resultPMF[0];
        }
      }
      resultPMF = newPMF;
    }
    if (document.getElementById('mirrorPlating').checked && assaultDiceCount > 0) {
      // Shift PMF up by 1 (only if assault dice are present)
      const newPMF = Array(resultPMF.length + 1).fill(0);
      for (let s = 0; s < resultPMF.length; s++) {
        newPMF[s + 1] += resultPMF[s];
      }
      resultPMF = newPMF;
    }
  }

  return resultPMF;
}

// Compute probability of at least N for an icon
function computeProbabilityAtLeastN(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount, desiredSum) {
  // Use computePMF so rerolls and modifiers are respected
  const pmf = computePMF(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount);
  let probability = 0;
  for (let s = desiredSum; s < pmf.length; s++) {
    probability += pmf[s] || 0;
  }
  if (probability < 0.0000009) probability = 0;
  return probability;
}

// DOM elements
const statusEl = document.getElementById('status');
const calculateBtn = document.getElementById('calculateBtn');
const resultEl = document.getElementById('result');
const rollBtn = document.getElementById('rollDiceBtn');

// Visual dice containers - now multiple
// const assaultVisuals = document.querySelectorAll('.assault-visual');
// const skirmishVisuals = document.querySelectorAll('.skirmish-visual');
// const raidVisuals = document.querySelectorAll('.raid-visual');

// Buttons
// const assaultPlus = document.getElementById('assaultPlus');
// const assaultMinus = document.getElementById('assaultMinus');
// const skirmishPlus = document.getElementById('skirmishPlus');
// const skirmishMinus = document.getElementById('skirmishMinus');
// const raidPlus = document.getElementById('raidPlus');
// const raidMinus = document.getElementById('raidMinus');

// Other inputs
// const iconSelectEl = document.getElementById('iconSelect'); // Removed - no longer used
// const thresholdSelectEl = document.getElementById('thresholdSelect'); // Now created dynamically in results

// Function to attach event listeners to dice buttons
function attachEventListeners(container) {
  container.querySelectorAll('.assault-label').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.assault-visual');
      if (visual.children.length >= 6) return;
      const die = createDieElement('assault', 0);
      visual.appendChild(die);
      updateResults();
    });
  });

  container.querySelectorAll('.skirmish-label').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.skirmish-visual');
      if (visual.children.length >= 6) return;
      const die = createDieElement('skirmish', 0);
      visual.appendChild(die);
      updateResults();
    });
  });

  container.querySelectorAll('.raid-label').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.raid-visual');
      if (visual.children.length >= 6) return;
      const die = createDieElement('raid', 0);
      visual.appendChild(die);
      updateResults();
    });
  });

  container.querySelectorAll('.assault-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.assault-visual');
      visual.innerHTML = '';
      updateResults();
    });
  });

  container.querySelectorAll('.skirmish-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.skirmish-visual');
      visual.innerHTML = '';
      updateResults();
    });
  });

  container.querySelectorAll('.raid-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const visual = btn.parentElement.querySelector('.raid-visual');
      visual.innerHTML = '';
      updateResults();
    });
  });
}

// Attach event listeners to initial elements
attachEventListeners(document);

// Die image paths and face positions (individual face images)
const dieData = {
  assault: {
    faces: [
      { image: './dice/faces/assault-die_r1_c0.png' }, // 2 hits
      { image: './dice/faces/assault-die_r1_c1.png' }, // 2 hits + self-hit
      { image: './dice/faces/assault-die_r1_c2.png' }, // hit + intercept
      { image: './dice/faces/assault-die_r2_c0.png' }, // hit + self-hit
      { image: './dice/faces/assault-die_r2_c1.png' }, // hit + self-hit
      { image: './dice/faces/assault-die_r2_c2.png' }, // miss
    ]
  },
  skirmish: {
    faces: [
      { image: './dice/faces/skirmish-die_r1_c0.png' }, // miss
      { image: './dice/faces/skirmish-die_r1_c1.png' }, // miss
      { image: './dice/faces/skirmish-die_r1_c2.png' }, // miss
      { image: './dice/faces/skirmish-die_r2_c0.png' }, // hit
      { image: './dice/faces/skirmish-die_r2_c1.png' }, // hit
      { image: './dice/faces/skirmish-die_r2_c2.png' }, // hit
    ]
  },
  raid: {
    faces: [
      { image: './dice/faces/raid-die_r1_c0.png' }, // 2 keys + intercept
      { image: './dice/faces/raid-die_r1_c1.png' }, // key + self-hit
      { image: './dice/faces/raid-die_r1_c2.png' }, // key + building hit
      { image: './dice/faces/raid-die_r2_c0.png' }, // self-hit + building hit
      { image: './dice/faces/raid-die_r2_c1.png' }, // self-hit + building hit
      { image: './dice/faces/raid-die_r2_c2.png' }, // intercept
    ]
  }
};

// Create a visual die element showing specific face
function createDieElement(type, faceIndex = null) {
  const die = document.createElement('div');
  die.className = 'dice-icon';
  
  // Store the current face index and type on the element
  die.dataset.dieType = type;
  die.dataset.faceIndex = faceIndex;
  
  const data = dieData[type];
  if (data && faceIndex !== null && data.faces[faceIndex]) {
    // For unrolled dice, always use r0_c0 image
    const face = { image: './dice/faces/' + type + '-die_r0_c0.png' };
    die.style.backgroundImage = `url(${face.image})`;
    die.style.backgroundSize = 'contain';
    die.style.backgroundRepeat = 'no-repeat';
    die.style.backgroundPosition = 'center';
  } else {
    // Fallback to full image
    die.style.backgroundImage = `url(${data ? data.image : './dice/images/' + type + '-die.png'})`;
  }
  
  // Add text overlay with first letter of dice type
  const textOverlay = document.createElement('div');
  textOverlay.className = 'dice-text-overlay';
  textOverlay.textContent = type.charAt(0).toUpperCase();
  die.appendChild(textOverlay);
  
  // Add click listener to remove the die when clicked
  die.addEventListener('click', () => {
    die.remove();
    updateResults();
  });
  
  return die;
}

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Advanced mode toggle
let isAdvancedMode = false; // Start with advanced mode off by default
const advancedToggle = document.getElementById('advancedToggle');

function updateAdvancedMode() {
  advancedToggle.textContent = isAdvancedMode ? 'Advanced Mode: On' : 'Advanced Mode: Off';
  advancedToggle.classList.toggle('active', isAdvancedMode);
  document.getElementById('addDieRollBtn').style.display = isAdvancedMode ? 'block' : 'none';
  document.getElementById('customProbSection').style.display = isAdvancedMode ? 'block' : 'none';
  document.querySelector('.dice-sections').classList.toggle('centered', !isAdvancedMode);
  document.querySelectorAll('.dice-inputs').forEach(el => el.classList.toggle('centered', !isAdvancedMode));
  const layout = document.querySelector('.calculator-layout');
  if (layout) {
    layout.classList.toggle('single-column', !isAdvancedMode);
  }
  updateResults();
}

advancedToggle.addEventListener('click', () => {
  isAdvancedMode = !isAdvancedMode;
  localStorage.setItem('advancedMode', isAdvancedMode);
  updateAdvancedMode();
});

// Initial advanced mode setup
updateAdvancedMode();

// Icon select and desired sum change listeners (removed - now showing all icons)
// iconSelectEl.addEventListener('change', updateResults);
// desiredSumEl.addEventListener('change', updateResults);

// Threshold select change listener (now handled dynamically in updateResults)

// Calculate button (removed - now automatic)
// calculateBtn.addEventListener('click', () => {
//   const assault = assaultVisual.children.length;
//   const skirmish = skirmishVisual.children.length;
//   const raid = raidVisual.children.length;
//   const icon = iconSelectEl.value;
//   const desired = parseInt(desiredSumEl.value) || 1;

//   const prob = computeProbabilityAtLeastN(icon, assault, skirmish, raid, desired);
//   const percent = round(prob, true);

//   resultEl.textContent = `Probability of at least ${desired} ${icon}(s): ${percent}%`;
// });

// Roll button
rollBtn.addEventListener('click', () => {
  // Reset total rolled counts for new roll
  totalRolled = { hit: 0, selfhit: 0, intercept: 0, key: 0, buildinghit: 0 };
  
  // Roll all assault dice
  document.querySelectorAll('.assault-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const randomFace = Math.floor(Math.random() * 6);
      const face = dieData.assault.faces[randomFace];
      die.style.backgroundImage = `url(${face.image})`;
      die.dataset.faceIndex = randomFace; // Update stored face index
      // Remove the letter overlay after rolling
      const overlay = die.querySelector('.dice-text-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
  });

  // Roll all skirmish dice
  document.querySelectorAll('.skirmish-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const randomFace = Math.floor(Math.random() * 6);
      const face = dieData.skirmish.faces[randomFace];
      die.style.backgroundImage = `url(${face.image})`;
      die.dataset.faceIndex = randomFace; // Update stored face index
      // Remove the letter overlay after rolling
      const overlay = die.querySelector('.dice-text-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
  });

  // Roll all raid dice
  document.querySelectorAll('.raid-visual').forEach(visual => {
    Array.from(visual.children).forEach(die => {
      const randomFace = Math.floor(Math.random() * 6);
      const face = dieData.raid.faces[randomFace];
      die.style.backgroundImage = `url(${face.image})`;
      die.dataset.faceIndex = randomFace; // Update stored face index
      // Remove the letter overlay after rolling
      const overlay = die.querySelector('.dice-text-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
  });

  // Count icons from this roll
  const icons = countRolledIcons();

  // Add to total rolled
  Object.keys(totalRolled).forEach(icon => {
    totalRolled[icon] += icons[icon];
  });

  updateResults(); // Update the results table with accumulated counts
});

// Intercept multiplier change listener
document.getElementById('interceptMultiplier').addEventListener('change', updateResults);

// Skirmish rerolls change listener
document.getElementById('skirmishRerolls').addEventListener('change', updateResults);

// Assault rerolls change listener
document.getElementById('assaultRerolls').addEventListener('change', updateResults);
document.getElementById('raidRerolls').addEventListener('change', updateResults);

// Empath rerolls change listener
document.getElementById('empathVision').addEventListener('change', updateResults);

// Assault reroll faces modal
document.getElementById('assaultRerollFacesBtn').addEventListener('click', () => {
  const modal = document.getElementById('assaultRerollModal');
  const checkboxesDiv = document.getElementById('assaultFacesCheckboxes');
  checkboxesDiv.innerHTML = '';
  
  // Create face options in priority order
  assaultFacePriority.forEach((faceIndex) => {
    const face = AssaultDie.sides[faceIndex];
    const faceDiv = document.createElement('div');
    // For linked faces 1 and 5 (faces 2 and 6), show as selected if either is selected
    const isSelected = selectedAssaultFaces.has(faceIndex) || 
                      (faceIndex === 1 && selectedAssaultFaces.has(5)) || 
                      (faceIndex === 5 && selectedAssaultFaces.has(1));
    faceDiv.className = `face-option ${isSelected ? 'selected' : ''}`;
    faceDiv.dataset.faceIndex = faceIndex;
    faceDiv.draggable = true;
    
    const img = document.createElement('img');
    img.src = dieData.assault.faces[faceIndex].image;
    img.alt = `Face ${faceIndex + 1}`;
    img.style.width = '40px';
    img.style.height = '40px';
    img.style.marginBottom = '5px';
    
    const label = document.createElement('div');
    label.className = 'face-label';
    label.textContent = `Face ${faceIndex + 1}`;
    
    faceDiv.appendChild(img);
    faceDiv.appendChild(label);
    
    // Click to select/deselect
    faceDiv.addEventListener('click', (e) => {
      if (e.target === faceDiv || e.target === img || e.target === label) {
        const idx = parseInt(faceDiv.dataset.faceIndex);
        
        // Special handling for linked faces 1 and 5 (faces 2 and 6)
        if (idx === 1 || idx === 5) {
          const hasAny = selectedAssaultFaces.has(1) || selectedAssaultFaces.has(5);
          if (hasAny) {
            // Deselect both
            selectedAssaultFaces.delete(1);
            selectedAssaultFaces.delete(5);
            // Update both face elements
            document.querySelectorAll('[data-face-index="1"], [data-face-index="5"]').forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select both
            selectedAssaultFaces.add(1);
            selectedAssaultFaces.add(5);
            // Update both face elements
            document.querySelectorAll('[data-face-index="1"], [data-face-index="5"]').forEach(el => {
              el.classList.add('selected');
            });
          }
        } else {
          // Normal behavior for other faces
          if (selectedAssaultFaces.has(idx)) {
            selectedAssaultFaces.delete(idx);
            faceDiv.classList.remove('selected');
          } else {
            selectedAssaultFaces.add(idx);
            faceDiv.classList.add('selected');
          }
        }
      }
    });
    
    // Drag and drop
    faceDiv.addEventListener('dragstart', (e) => {
      faceDiv.classList.add('dragging');
      e.dataTransfer.setData('text/plain', faceIndex);
    });
    
    faceDiv.addEventListener('dragend', () => {
      faceDiv.classList.remove('dragging');
    });
    
    // Touch drag support for mobile
    let touchStartY = 0;
    let isDragging = false;
    
    faceDiv.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      isDragging = false;
      faceDiv.classList.add('dragging');
    });
    
    faceDiv.addEventListener('touchmove', (e) => {
      if (!isDragging) {
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        if (deltaY > 10) { // Start dragging after 10px movement
          isDragging = true;
        }
      }
      if (isDragging) {
        e.preventDefault();
        const y = e.touches[0].clientY;
        const afterElement = getDragAfterElement(checkboxesDiv, y);
        if (afterElement == null) {
          checkboxesDiv.appendChild(faceDiv);
        } else {
          checkboxesDiv.insertBefore(faceDiv, afterElement);
        }
      }
    });
    
    faceDiv.addEventListener('touchend', () => {
      faceDiv.classList.remove('dragging');
      if (isDragging) {
        // Update priority order
        const faceOptions = Array.from(checkboxesDiv.children);
        assaultFacePriority = faceOptions.map(el => parseInt(el.dataset.faceIndex));
      }
    });
    
    checkboxesDiv.appendChild(faceDiv);
  });
  
  // Drag over and drop on container
  checkboxesDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = document.querySelector('.face-option.dragging');
    if (!dragging) return;
    
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const afterElement = getDragAfterElement(checkboxesDiv, y);
    if (afterElement == null) {
      checkboxesDiv.appendChild(dragging);
    } else {
      checkboxesDiv.insertBefore(dragging, afterElement);
    }
  });
  
  checkboxesDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    // Update priority order
    const faceOptions = Array.from(checkboxesDiv.children);
    assaultFacePriority = faceOptions.map(el => parseInt(el.dataset.faceIndex));
  });
  
  modal.style.display = 'block';
});

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.face-option:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

document.getElementById('assaultRerollSaveBtn').addEventListener('click', () => {
  // Selection is already updated via clicks
  document.getElementById('assaultRerollModal').style.display = 'none';
  updateResults();
});

document.getElementById('assaultRerollCancelBtn').addEventListener('click', () => {
  document.getElementById('assaultRerollModal').style.display = 'none';
});

// Raid reroll faces modal
document.getElementById('raidRerollFacesBtn').addEventListener('click', () => {
  const modal = document.getElementById('raidRerollModal');
  const checkboxesDiv = document.getElementById('raidFacesCheckboxes');
  checkboxesDiv.innerHTML = '';
  
  // Create face options in priority order
  raidFacePriority.forEach((faceIndex) => {
    const face = RaidDie.sides[faceIndex];
    const faceDiv = document.createElement('div');
    // For linked faces 3 and 5 (faces 4 and 6), show as selected if either is selected
    const isSelected = selectedRaidFaces.has(faceIndex) || 
                      (faceIndex === 3 && selectedRaidFaces.has(5)) || 
                      (faceIndex === 5 && selectedRaidFaces.has(3));
    faceDiv.className = `face-option ${isSelected ? 'selected' : ''}`;
    faceDiv.dataset.faceIndex = faceIndex;
    faceDiv.draggable = true;
    
    const img = document.createElement('img');
    img.src = dieData.raid.faces[faceIndex].image;
    img.alt = `Face ${faceIndex + 1}`;
    img.style.width = '40px';
    img.style.height = '40px';
    img.style.marginBottom = '5px';
    
    const label = document.createElement('div');
    label.className = 'face-label';
    label.textContent = `Face ${faceIndex + 1}`;
    
    faceDiv.appendChild(img);
    faceDiv.appendChild(label);
    
    // Click to select/deselect
    faceDiv.addEventListener('click', (e) => {
      if (e.target === faceDiv || e.target === img || e.target === label) {
        const idx = parseInt(faceDiv.dataset.faceIndex);
        
        // Special handling for linked faces 3 and 5 (faces 4 and 6)
        if (idx === 3 || idx === 5) {
          const hasAny = selectedRaidFaces.has(3) || selectedRaidFaces.has(5);
          if (hasAny) {
            // Deselect both
            selectedRaidFaces.delete(3);
            selectedRaidFaces.delete(5);
            // Update both face elements
            document.querySelectorAll('[data-face-index="3"], [data-face-index="5"]').forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select both
            selectedRaidFaces.add(3);
            selectedRaidFaces.add(5);
            // Update both face elements
            document.querySelectorAll('[data-face-index="3"], [data-face-index="5"]').forEach(el => {
              el.classList.add('selected');
            });
          }
        } else {
          // Normal behavior for other faces
          if (selectedRaidFaces.has(idx)) {
            selectedRaidFaces.delete(idx);
            faceDiv.classList.remove('selected');
          } else {
            selectedRaidFaces.add(idx);
            faceDiv.classList.add('selected');
          }
        }
        updateResults();
      }
    });
    
    // Drag and drop
    faceDiv.addEventListener('dragstart', (e) => {
      faceDiv.classList.add('dragging');
      e.dataTransfer.setData('text/plain', faceIndex);
    });
    
    faceDiv.addEventListener('dragend', () => {
      faceDiv.classList.remove('dragging');
    });
    
    // Touch drag support for mobile
    let touchStartY = 0;
    let isDragging = false;
    
    faceDiv.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      isDragging = false;
      faceDiv.classList.add('dragging');
    });
    
    faceDiv.addEventListener('touchmove', (e) => {
      if (!isDragging) {
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        if (deltaY > 10) { // Start dragging after 10px movement
          isDragging = true;
        }
      }
      if (isDragging) {
        e.preventDefault();
        const y = e.touches[0].clientY;
        const afterElement = getDragAfterElement(checkboxesDiv, y);
        if (afterElement == null) {
          checkboxesDiv.appendChild(faceDiv);
        } else {
          checkboxesDiv.insertBefore(faceDiv, afterElement);
        }
      }
    });
    
    faceDiv.addEventListener('touchend', () => {
      faceDiv.classList.remove('dragging');
      if (isDragging) {
        // Update priority order
        const faceOptions = Array.from(checkboxesDiv.children);
        raidFacePriority = faceOptions.map(el => parseInt(el.dataset.faceIndex));
      }
    });
    
    checkboxesDiv.appendChild(faceDiv);
  });
  
  // Drag over and drop on container
  checkboxesDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = document.querySelector('.face-option.dragging');
    if (!dragging) return;
    
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const afterElement = getDragAfterElement(checkboxesDiv, y);
    if (afterElement == null) {
      checkboxesDiv.appendChild(dragging);
    } else {
      checkboxesDiv.insertBefore(dragging, afterElement);
    }
  });
  
  checkboxesDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    // Update priority order
    const faceOptions = Array.from(checkboxesDiv.children);
    raidFacePriority = faceOptions.map(el => parseInt(el.dataset.faceIndex));
  });
  
  modal.style.display = 'block';
});

document.getElementById('raidRerollSaveBtn').addEventListener('click', () => {
  selectedRaidFaces.clear();
  document.querySelectorAll('#raidRerollModal .face-option.selected').forEach(el => {
    selectedRaidFaces.add(parseInt(el.dataset.faceIndex));
  });
  if (selectedRaidFaces.size === 0) {
    // Default to faces 3,4,6 if none selected
    selectedRaidFaces.add(2);
    selectedRaidFaces.add(3);
    selectedRaidFaces.add(5);
  }
  document.getElementById('raidRerollModal').style.display = 'none';
  updateResults();
});

document.getElementById('raidRerollCancelBtn').addEventListener('click', () => {
  document.getElementById('raidRerollModal').style.display = 'none';
});

// Empath reroll faces modal
document.getElementById('empathRerollFacesBtn').addEventListener('click', () => {
  const modal = document.getElementById('empathRerollModal');
  const checkboxesDiv = document.getElementById('empathFacesCheckboxes');
  checkboxesDiv.innerHTML = '';
  
  // Create sections for each die type
  const dieTypes = [
    { name: 'Assault', dieData: dieData.assault },
    { name: 'Skirmish', dieData: dieData.skirmish },
    { name: 'Raid', dieData: dieData.raid }
  ];
  
  dieTypes.forEach(dieType => {
    const sectionDiv = document.createElement('div');
    sectionDiv.style.marginBottom = '20px';
    
    const sectionTitle = document.createElement('h4');
    sectionTitle.textContent = `${dieType.name} Dice Faces`;
    sectionTitle.style.marginBottom = '10px';
    sectionTitle.style.color = 'var(--text)';
    sectionDiv.appendChild(sectionTitle);
    
    const facesContainer = document.createElement('div');
    facesContainer.style.display = 'grid';
    facesContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
    facesContainer.style.gap = '10px';
    facesContainer.style.marginBottom = '15px';
    
    // Get the appropriate selection set for this die type
    let selectionSet;
    if (dieType.name === 'Assault') selectionSet = selectedAssaultEmpathFaces;
    else if (dieType.name === 'Skirmish') selectionSet = selectedSkirmishEmpathFaces;
    else if (dieType.name === 'Raid') selectionSet = selectedRaidEmpathFaces;
    
    // Create face options (0-5 for all die types)
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const faceDiv = document.createElement('div');
      // Special handling for skirmish linked faces
      let isSelected = selectionSet.has(faceIndex);
      if (dieType.name === 'Skirmish' && (faceIndex === 0 || faceIndex === 1 || faceIndex === 2)) {
        isSelected = selectionSet.has(0) || selectionSet.has(1) || selectionSet.has(2);
      } else if (dieType.name === 'Skirmish' && (faceIndex === 3 || faceIndex === 4 || faceIndex === 5)) {
        isSelected = selectionSet.has(3) || selectionSet.has(4) || selectionSet.has(5);
      } else if (dieType.name === 'Assault' && (faceIndex === 1 || faceIndex === 5)) {
        isSelected = selectionSet.has(1) || selectionSet.has(5);
      } else if (dieType.name === 'Raid' && (faceIndex === 3 || faceIndex === 5)) {
        isSelected = selectionSet.has(3) || selectionSet.has(5);
      }
      faceDiv.className = `face-option ${isSelected ? 'selected' : ''}`;
      faceDiv.dataset.faceIndex = faceIndex;
      faceDiv.dataset.dieType = dieType.name.toLowerCase();
      faceDiv.style.cursor = 'pointer';
      faceDiv.style.display = 'flex';
      faceDiv.style.flexDirection = 'column';
      faceDiv.style.alignItems = 'center';
      faceDiv.style.padding = '8px';
      faceDiv.style.borderRadius = 'var(--radius-sm)';
      faceDiv.style.transition = 'all 0.2s';
      
      const img = document.createElement('img');
      img.src = dieType.dieData.faces[faceIndex].image;
      img.alt = `${dieType.name} Face ${faceIndex + 1}`;
      img.style.width = '50px';
      img.style.height = '50px';
      img.style.marginBottom = '5px';
      
      faceDiv.appendChild(img);
      
      // Click to select/deselect
      faceDiv.addEventListener('click', (e) => {
        const idx = parseInt(faceDiv.dataset.faceIndex);
        const dieTypeName = faceDiv.dataset.dieType;
        let targetSelectionSet;
        if (dieTypeName === 'assault') targetSelectionSet = selectedAssaultEmpathFaces;
        else if (dieTypeName === 'skirmish') targetSelectionSet = selectedSkirmishEmpathFaces;
        else if (dieTypeName === 'raid') targetSelectionSet = selectedRaidEmpathFaces;
        
        // Special handling for skirmish faces 0, 1, 2 - they are linked
        if (dieTypeName === 'skirmish' && (idx === 0 || idx === 1 || idx === 2)) {
          const hasAny = targetSelectionSet.has(0) || targetSelectionSet.has(1) || targetSelectionSet.has(2);
          if (hasAny) {
            // Deselect all three
            targetSelectionSet.delete(0);
            targetSelectionSet.delete(1);
            targetSelectionSet.delete(2);
            // Update all face elements for indices 0, 1, 2
            document.querySelectorAll(`[data-die-type="skirmish"][data-face-index="0"],
                                     [data-die-type="skirmish"][data-face-index="1"],
                                     [data-die-type="skirmish"][data-face-index="2"]`).forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select all three
            targetSelectionSet.add(0);
            targetSelectionSet.add(1);
            targetSelectionSet.add(2);
            // Update all face elements for indices 0, 1, 2
            document.querySelectorAll(`[data-die-type="skirmish"][data-face-index="0"],
                                     [data-die-type="skirmish"][data-face-index="1"],
                                     [data-die-type="skirmish"][data-face-index="2"]`).forEach(el => {
              el.classList.add('selected');
            });
          }
        } 
        // Special handling for assault faces 1, 5 - they are linked
        else if (dieTypeName === 'assault' && (idx === 1 || idx === 5)) {
          const hasAny = targetSelectionSet.has(1) || targetSelectionSet.has(5);
          if (hasAny) {
            // Deselect both
            targetSelectionSet.delete(1);
            targetSelectionSet.delete(5);
            // Update all face elements for indices 1, 5
            document.querySelectorAll(`[data-die-type="assault"][data-face-index="1"],
                                     [data-die-type="assault"][data-face-index="5"]`).forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select both
            targetSelectionSet.add(1);
            targetSelectionSet.add(5);
            // Update all face elements for indices 1, 5
            document.querySelectorAll(`[data-die-type="assault"][data-face-index="1"],
                                     [data-die-type="assault"][data-face-index="5"]`).forEach(el => {
              el.classList.add('selected');
            });
          }
        } 
        // Special handling for skirmish faces 3, 4, 5 - they are linked
        else if (dieTypeName === 'skirmish' && (idx === 3 || idx === 4 || idx === 5)) {
          const hasAny = targetSelectionSet.has(3) || targetSelectionSet.has(4) || targetSelectionSet.has(5);
          if (hasAny) {
            // Deselect all
            targetSelectionSet.delete(3);
            targetSelectionSet.delete(4);
            targetSelectionSet.delete(5);
            // Update all face elements for indices 3, 4, 5
            document.querySelectorAll(`[data-die-type="skirmish"][data-face-index="3"],
                                     [data-die-type="skirmish"][data-face-index="4"],
                                     [data-die-type="skirmish"][data-face-index="5"]`).forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select all
            targetSelectionSet.add(3);
            targetSelectionSet.add(4);
            targetSelectionSet.add(5);
            // Update all face elements for indices 3, 4, 5
            document.querySelectorAll(`[data-die-type="skirmish"][data-face-index="3"],
                                     [data-die-type="skirmish"][data-face-index="4"],
                                     [data-die-type="skirmish"][data-face-index="5"]`).forEach(el => {
              el.classList.add('selected');
            });
          }
        } 
        // Special handling for raid faces 3, 5 - they are linked
        else if (dieTypeName === 'raid' && (idx === 3 || idx === 5)) {
          const hasAny = targetSelectionSet.has(3) || targetSelectionSet.has(5);
          if (hasAny) {
            // Deselect both
            targetSelectionSet.delete(3);
            targetSelectionSet.delete(5);
            // Update all face elements for indices 3, 5
            document.querySelectorAll(`[data-die-type="raid"][data-face-index="3"],
                                     [data-die-type="raid"][data-face-index="5"]`).forEach(el => {
              el.classList.remove('selected');
            });
          } else {
            // Select both
            targetSelectionSet.add(3);
            targetSelectionSet.add(5);
            // Update all face elements for indices 3, 5
            document.querySelectorAll(`[data-die-type="raid"][data-face-index="3"],
                                     [data-die-type="raid"][data-face-index="5"]`).forEach(el => {
              el.classList.add('selected');
            });
          }
        } else {
          // Normal behavior for other faces
          if (targetSelectionSet.has(idx)) {
            targetSelectionSet.delete(idx);
            faceDiv.classList.remove('selected');
          } else {
            targetSelectionSet.add(idx);
            faceDiv.classList.add('selected');
          }
        }
      });
      
      facesContainer.appendChild(faceDiv);
    }
    
    sectionDiv.appendChild(facesContainer);
    checkboxesDiv.appendChild(sectionDiv);
  });
  
  modal.style.display = 'block';
});

document.getElementById('empathRerollSaveBtn').addEventListener('click', () => {
  // Selection is already updated via clicks
  document.getElementById('empathRerollModal').style.display = 'none';
  updateResults();
});

document.getElementById('empathRerollCancelBtn').addEventListener('click', () => {
  document.getElementById('empathRerollModal').style.display = 'none';
});

// Mirror Plating and Signal Breaker change listeners
document.getElementById('mirrorPlating').addEventListener('change', updateResults);
document.getElementById('signalBreaker').addEventListener('change', updateResults);

// Add die roll button
document.getElementById('addDieRollBtn').addEventListener('click', () => {
  const diceSections = document.querySelector('.dice-sections');
  const addRollSection = document.querySelector('.add-roll-section');
  const newDiceInputs = document.createElement('div');
  newDiceInputs.className = 'dice-inputs added-dice-inputs';
  newDiceInputs.innerHTML = `
    <div class="dice-inputs-header">
      <button class="remove-dice-inputs-btn" title="Remove this dice set">×</button>
    </div>
    <div class="dice-row">
      <button class="dice-label-btn assault-label">Assault</button>
      <div class="dice-visual assault-visual"></div>
      <button class="dice-clear-btn assault-clear" title="Clear all Assault dice">×</button>
    </div>
    <div class="dice-row">
      <button class="dice-label-btn skirmish-label">Skirmish</button>
      <div class="dice-visual skirmish-visual"></div>
      <button class="dice-clear-btn skirmish-clear" title="Clear all Skirmish dice">×</button>
    </div>
    <div class="dice-row">
      <button class="dice-label-btn raid-label">Raid</button>
      <div class="dice-visual raid-visual"></div>
      <button class="dice-clear-btn raid-clear" title="Clear all Raid dice">×</button>
    </div>
  `;
  diceSections.insertBefore(newDiceInputs, addRollSection);
  // Attach event listeners to the new section
  attachEventListeners(newDiceInputs);
  
  // Add remove button functionality
  newDiceInputs.querySelector('.remove-dice-inputs-btn').addEventListener('click', () => {
    newDiceInputs.remove();
    updateResults();
  });
  
  updateResults();
});

// Card enlargement modal
function showEnlargedCard(imageSrc, cardName) {
  document.getElementById('cardModalImage').src = imageSrc;
  document.getElementById('cardModalImage').alt = cardName;
  document.getElementById('cardModalTitle').textContent = cardName;
  document.getElementById('cardModal').style.display = 'block';
}

// Make function globally available
window.showEnlargedCard = showEnlargedCard;

document.getElementById('cardModalClose').addEventListener('click', () => {
  document.getElementById('cardModal').style.display = 'none';
});

// Close card modal when clicking outside
document.getElementById('cardModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('cardModal')) {
    document.getElementById('cardModal').style.display = 'none';
  }
});

// Help modal
document.getElementById('helpBtn').addEventListener('click', () => {
  document.getElementById('helpModal').style.display = 'block';
});

document.getElementById('helpCloseBtn').addEventListener('click', () => {
  document.getElementById('helpModal').style.display = 'none';
});

// Close modal when clicking outside
document.getElementById('helpModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('helpModal')) {
    document.getElementById('helpModal').style.display = 'none';
  }
});

statusEl.style.display = 'none';