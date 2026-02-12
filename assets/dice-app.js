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
  if (document.getElementById('mirrorPlating').checked) {
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
    maximumFractionDigits: 2,
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
  const assault = AssaultDie.sides.map(side => side.count[icon]);
  const skirmish = SkirmishDie.sides.map(side => side.count[icon]);
  const raid = RaidDie.sides.map(side => side.count[icon]);

  let expected = 0;
  
  // Add expected value from assault dice
  for (let i = 0; i < assaultDiceCount; i++) {
    expected += assault.reduce((sum, val) => sum + val, 0) / assault.length;
  }
  
  // Add expected value from skirmish dice (only for hit)
  if (icon === 'hit') {
    for (let i = 0; i < skirmishDiceCount; i++) {
      expected += skirmish.reduce((sum, val) => sum + val, 0) / skirmish.length;
    }
  }
  
  // Add expected value from raid dice (for key, selfhit, intercept, buildinghit)
  if (icon !== 'hit') {
    for (let i = 0; i < raidDiceCount; i++) {
      expected += raid.reduce((sum, val) => sum + val, 0) / raid.length;
    }
  }

  // Apply intercept modifiers to EV
  if (icon === 'intercept') {
    if (document.getElementById('signalBreaker').checked) {
      expected = Math.max(0, expected - 1);
    }
    if (document.getElementById('mirrorPlating').checked) {
      expected += 1;
    }
  }

  // Add extra self-hits from intercepts
  if (icon === 'selfhit') {
    const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
    // Approximate: add multiplier if expected intercept > 0
    const interceptEV = computeExpectedValue('intercept', assaultDiceCount, 0, raidDiceCount);
    if (interceptEV > 0) {
      expected += multiplier;
    }
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
    { key: 'selfhit', name: 'Damage to Self', image: './dice/images/selfhit.png' },
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
    const prob = operator === 'gte' ? computeProbabilityAtLeastN(icon.key, assault, skirmish, raid, threshold) : 1 - computeProbabilityAtLeastN(icon.key, assault, skirmish, raid, threshold + 1);
    const percent = round(prob, true);
    const rolledCount = totalRolled[icon.key] || 0;

    // Compute PMF for chart
    const pmf = computePMF(icon.key, assault, skirmish, raid);
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
  if (totalDice > 0) {
    const bellCurves = allIcons.map(icon => {
      const pmf = computePMF(icon.key, assault, skirmish, raid);
      const maxProb = Math.max(...pmf);
      
      // Don't show chart if one outcome has 100% probability
      if (maxProb === 1) {
        return `
          <div class="bell-curve-item">
            <div class="bell-curve-header">
              <img src="${icon.image}" alt="${icon.name}" class="bell-curve-icon">
              <span>${icon.name}</span>
            </div>
            <div class="bell-curve-deterministic">100% chance of ${pmf.indexOf(1)} ${icon.name.toLowerCase()}(s)</div>
          </div>
        `;
      }
      
      // Calculate bar width based on number of bars and available space
      const numBars = pmf.length;
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
      
      const chartBars = pmf.map((p, i) => {
        const height = maxProb > 0 ? (p / maxProb) * 120 : 0; // 120px max height
        const percent = (p * 100).toFixed(1);
        return `
          <div class="bell-curve-bar-container" style="width: ${barWidth};">
            <div class="bell-curve-bar" style="height: ${height}px;" title="${i}: ${percent}%"></div>
            <div class="bell-curve-label">${i}</div>
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
      <h3 class="bell-curves-title">Probability Distributions</h3>
      <div class="bell-curves-container">${bellCurves}</div>
    `;
    bellCurvesEl.style.display = 'block';
  } else {
    bellCurvesEl.innerHTML = '';
    bellCurvesEl.style.display = 'none';
  }

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
            <input type="number" id="min-${icon.key}" class="custom-prob-input" min="0" value="${currentValues[icon.key]?.min || 0}">
            <label>Max:</label>
            <input type="number" id="max-${icon.key}" class="custom-prob-input" min="0" value="${currentValues[icon.key]?.max || 999}">
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
      const numSimulations = 10000;
      let successCount = 0;

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

      for (let sim = 0; sim < numSimulations; sim++) {
        const totals = { hit: 0, selfhit: 0, intercept: 0, key: 0, buildinghit: 0 };

        // Roll all dice
        dicePools.forEach(pool => {
          for (let d = 0; d < pool.count; d++) {
            const face = pool.die.sides[Math.floor(Math.random() * 6)];
            Object.keys(totals).forEach(icon => {
              totals[icon] += face.count[icon] || 0;
            });
          }
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

        // Check if all conditions are met
        let allMet = true;
        for (const icon of allIcons) {
          const { min, max } = ranges[icon.key];
          if (totals[icon.key] < min || totals[icon.key] > max) {
            allMet = false;
            break;
          }
        }
        if (allMet) successCount++;
      }

      const prob = successCount / numSimulations;
      document.getElementById('combinedResult').textContent = round(prob, true) + '%';
    };

    // Add event listener for combined calculation button (optional, since auto-updates)
    document.getElementById('calculateCombined').addEventListener('click', updateCombined);
  } else {
    customProbEl.innerHTML = '';
  }
}

// Compute probability mass function for an icon
function computePMF(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount) {
  if (icon === 'selfhit') {
    const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
    
    // Compute base selfhit PMF
    const baseDice1Sides = AssaultDie.sides.map(side => side.count.selfhit);
    const baseDice2Sides = RaidDie.sides.map(side => side.count.selfhit);
    const baseMaxSum = Math.max(...baseDice1Sides) * assaultDiceCount + Math.max(...baseDice2Sides) * raidDiceCount;
    
    const pmf = (sides) => {
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

    const P1 = Array(baseMaxSum + 1).fill(0);
    const P2 = Array(baseMaxSum + 1).fill(0);
    P1[0] = 1;
    P2[0] = 1;

    const updateProbabilities = (P, pmf, diceCount) => {
      for (let i = 1; i <= diceCount; i++) {
        const newP = Array(baseMaxSum + 1).fill(0);
        for (let s = 0; s <= baseMaxSum; s++) {
          for (const [side, prob] of Object.entries(pmf)) {
            const sideNum = parseInt(side);
            if (s >= sideNum) {
              newP[s] += prob * P[s - sideNum];
            }
          }
        }
        for (let s = 0; s <= baseMaxSum; s++) {
          P[s] = newP[s];
        }
      }
    };

    updateProbabilities(P1, pmf(baseDice1Sides), assaultDiceCount);
    updateProbabilities(P2, pmf(baseDice2Sides), raidDiceCount);

    const basePMF = Array(baseMaxSum + 1).fill(0);
    for (let s = 0; s <= baseMaxSum; s++) {
      for (let x = 0; x <= s; x++) {
        basePMF[s] += P1[x] * P2[s - x];
      }
    }

    // Compute intercept PMF
    const interceptDice1Sides = AssaultDie.sides.map(side => side.count.intercept);
    const interceptDice2Sides = RaidDie.sides.map(side => side.count.intercept);
    const interceptMaxSum = Math.max(...interceptDice1Sides) * assaultDiceCount + Math.max(...interceptDice2Sides) * raidDiceCount;

    const IP1 = Array(interceptMaxSum + 1).fill(0);
    const IP2 = Array(interceptMaxSum + 1).fill(0);
    IP1[0] = 1;
    IP2[0] = 1;

    updateProbabilities(IP1, pmf(interceptDice1Sides), assaultDiceCount);
    updateProbabilities(IP2, pmf(interceptDice2Sides), raidDiceCount);

    const interceptPMF = Array(interceptMaxSum + 1).fill(0);
    for (let s = 0; s <= interceptMaxSum; s++) {
      for (let x = 0; x <= s; x++) {
        interceptPMF[s] += IP1[x] * IP2[s - x];
      }
    }

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

  let dice1Sides, countDice1, dice2Sides, countDice2;

  dice1Sides = AssaultDie.sides.map(side => side.count[icon]);
  countDice1 = assaultDiceCount;
  if (icon === 'hit') {
    dice2Sides = SkirmishDie.sides.map(side => side.count[icon]);
    countDice2 = skirmishDiceCount;
  } else {
    dice2Sides = RaidDie.sides.map(side => side.count[icon]);
    countDice2 = raidDiceCount;
  }

  // Apply intercept modifiers
  if (icon === 'intercept') {
    if (document.getElementById('signalBreaker').checked) {
      dice1Sides = dice1Sides.map(x => Math.max(0, x - 1));
      dice2Sides = dice2Sides.map(x => Math.max(0, x - 1));
    }
    if (document.getElementById('mirrorPlating').checked) {
      dice1Sides = dice1Sides.map(x => x + 1);
      dice2Sides = dice2Sides.map(x => x + 1);
    }
  }

  const maxSum = Math.max(...dice1Sides) * countDice1 + Math.max(...dice2Sides) * countDice2;

  const pmf = (sides) => {
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

  const P1 = Array(maxSum + 1).fill(0);
  const P2 = Array(maxSum + 1).fill(0);
  P1[0] = 1;
  P2[0] = 1;

  const updateProbabilities = (P, pmf, diceCount) => {
    for (let i = 1; i <= diceCount; i++) {
      const newP = Array(maxSum + 1).fill(0);
      for (let s = 0; s <= maxSum; s++) {
        for (const [side, prob] of Object.entries(pmf)) {
          const sideNum = parseInt(side);
          if (s >= sideNum) {
            newP[s] += prob * P[s - sideNum];
          }
        }
      }
      for (let s = 0; s <= maxSum; s++) {
        P[s] = newP[s];
      }
    }
  };

  updateProbabilities(P1, pmf(dice1Sides), countDice1);
  updateProbabilities(P2, pmf(dice2Sides), countDice2);

  const pmfResult = Array(maxSum + 1).fill(0);
  for (let s = 0; s <= maxSum; s++) {
    for (let x = 0; x <= s; x++) {
      pmfResult[s] += P1[x] * P2[s - x];
    }
  }

  return pmfResult;
}

// Compute probability of at least N for an icon
function computeProbabilityAtLeastN(icon, assaultDiceCount, skirmishDiceCount, raidDiceCount, desiredSum) {
  if (icon === 'selfhit') {
    const multiplier = parseInt(document.getElementById('interceptMultiplier').value) || 0;
    
    // Compute base selfhit PMF
    const baseDice1Sides = AssaultDie.sides.map(side => side.count.selfhit);
    const baseDice2Sides = RaidDie.sides.map(side => side.count.selfhit);
    const baseMaxSum = Math.max(desiredSum - 1, Math.max(...baseDice1Sides) * assaultDiceCount + Math.max(...baseDice2Sides) * raidDiceCount);
    
    const pmf = (sides) => {
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

    const P1 = Array(baseMaxSum + 1).fill(0);
    const P2 = Array(baseMaxSum + 1).fill(0);
    P1[0] = 1;
    P2[0] = 1;

    const updateProbabilities = (P, pmf, diceCount) => {
      for (let i = 1; i <= diceCount; i++) {
        const newP = Array(baseMaxSum + 1).fill(0);
        for (let s = 0; s <= baseMaxSum; s++) {
          for (const [side, prob] of Object.entries(pmf)) {
            const sideNum = parseInt(side);
            if (s >= sideNum) {
              newP[s] += prob * P[s - sideNum];
            }
          }
        }
        for (let s = 0; s <= baseMaxSum; s++) {
          P[s] = newP[s];
        }
      }
    };

    updateProbabilities(P1, pmf(baseDice1Sides), assaultDiceCount);
    updateProbabilities(P2, pmf(baseDice2Sides), raidDiceCount);

    const basePMF = Array(baseMaxSum + 1).fill(0);
    for (let s = 0; s <= baseMaxSum; s++) {
      for (let x = 0; x <= s; x++) {
        basePMF[s] += P1[x] * P2[s - x];
      }
    }

    // Compute intercept PMF
    const interceptDice1Sides = AssaultDie.sides.map(side => side.count.intercept);
    const interceptDice2Sides = RaidDie.sides.map(side => side.count.intercept);
    const interceptMaxSum = Math.max(...interceptDice1Sides) * assaultDiceCount + Math.max(...interceptDice2Sides) * raidDiceCount;

    const IP1 = Array(interceptMaxSum + 1).fill(0);
    const IP2 = Array(interceptMaxSum + 1).fill(0);
    IP1[0] = 1;
    IP2[0] = 1;

    updateProbabilities(IP1, pmf(interceptDice1Sides), assaultDiceCount);
    updateProbabilities(IP2, pmf(interceptDice2Sides), raidDiceCount);

    const interceptPMF = Array(interceptMaxSum + 1).fill(0);
    for (let s = 0; s <= interceptMaxSum; s++) {
      for (let x = 0; x <= s; x++) {
        interceptPMF[s] += IP1[x] * IP2[s - x];
      }
    }

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
    const PCombined = Array(baseMaxSum + multiplier + 1).fill(0);
    for (let s = 0; s <= baseMaxSum; s++) {
      PCombined[s] += basePMF[s] * (1 - p);
      PCombined[s + multiplier] += basePMF[s] * p;
    }

    let probability = 0;
    for (let s = desiredSum; s <= baseMaxSum + multiplier; s++) {
      probability += PCombined[s];
    }

    if (probability < 0.0000009) {
      probability = 0;
    }

    return probability;
  }

  let dice1Sides, countDice1, dice2Sides, countDice2;

  dice1Sides = AssaultDie.sides.map(side => side.count[icon]);
  countDice1 = assaultDiceCount;
  if (icon === 'hit') {
    dice2Sides = SkirmishDie.sides.map(side => side.count[icon]);
    countDice2 = skirmishDiceCount;
  } else {
    dice2Sides = RaidDie.sides.map(side => side.count[icon]);
    countDice2 = raidDiceCount;
  }

  const maxSum = Math.max(desiredSum - 1, Math.max(...dice1Sides) * countDice1 + Math.max(...dice2Sides) * countDice2);

  const pmf = (sides) => {
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

  const P1 = Array(maxSum + 1).fill(0);
  const P2 = Array(maxSum + 1).fill(0);
  P1[0] = 1;
  P2[0] = 1;

  const pmf1 = pmf(dice1Sides);
  const pmf2 = pmf(dice2Sides);

  const updateProbabilities = (P, pmf, diceCount) => {
    for (let i = 1; i <= diceCount; i++) {
      const newP = Array(maxSum + 1).fill(0);
      for (let s = 0; s <= maxSum; s++) {
        for (const [side, prob] of Object.entries(pmf)) {
          const sideNum = parseInt(side);
          if (s >= sideNum) {
            newP[s] += prob * P[s - sideNum];
          }
        }
      }
      for (let s = 0; s <= maxSum; s++) {
        P[s] = newP[s];
      }
    }
  };

  updateProbabilities(P1, pmf1, countDice1);
  updateProbabilities(P2, pmf2, countDice2);

  const PCombined = Array(maxSum + 1).fill(0);
  for (let s = 0; s <= maxSum; s++) {
    for (let x = 0; x <= s; x++) {
      PCombined[s] += P1[x] * P2[s - x];
    }
  }

  let probability = 0;
  for (let s = desiredSum; s <= maxSum; s++) {
    probability += PCombined[s];
  }

  if (probability < 0.0000009) {
    probability = 0;
  }

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
    die.title = `${type.charAt(0).toUpperCase() + type.slice(1)} Die - Unrolled`;
  } else {
    // Fallback to full image
    die.style.backgroundImage = `url(${data ? data.image : './dice/images/' + type + '-die.png'})`;
    die.title = `${type.charAt(0).toUpperCase() + type.slice(1)} Die`;
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

statusEl.style.display = 'none';