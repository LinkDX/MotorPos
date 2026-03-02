<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { config as defaultConfig, type LotteryConfig } from './config';

interface Assignment {
  spaceNumber: number;
  unitId: string;
  type: '大' | '小';
}

type SwapTarget = 
  | { type: 'assigned'; index: number } 
  | { type: 'candidate'; index: number } 
  | { type: 'secondCandidate'; index: number }
  | null;

const STORAGE_KEY = 'motor_pos_v2_results';
const CONFIG_KEY = 'motor_pos_v2_config';

// Config State
const config = ref<LotteryConfig>({ ...defaultConfig });
const showConfig = ref(false);

// Operational State
const candidates = ref<string[]>([]);
const secondCandidates = ref<string[]>([]);
const assignments = ref<Assignment[]>([]);
const isRolling = ref(false);
const swapSelection = ref<SwapTarget>(null);
const filterQuery = ref('');

const tempConfigStr = ref({
  candidates: '',
  secondCandidates: '',
  bigSpaceNumbers: ''
});

onMounted(() => {
  // Load Config
  const savedConfig = localStorage.getItem(CONFIG_KEY);
  if (savedConfig) {
    const parsedConfig = JSON.parse(savedConfig);
    // 兼容舊版設定，將 bigSpacesCount 轉換為 bigSpaceNumbers
    if ('bigSpacesCount' in parsedConfig && !parsedConfig.bigSpaceNumbers) {
      parsedConfig.bigSpaceNumbers = Array.from({ length: parsedConfig.bigSpacesCount }, (_, i) => i + 1);
      delete parsedConfig.bigSpacesCount;
    }
    config.value = { ...defaultConfig, ...parsedConfig };
  }
  
  // Initialize candidates from current config
  candidates.value = [...config.value.candidates];
  secondCandidates.value = [...config.value.secondCandidates];
  
  tempConfigStr.value.candidates = config.value.candidates.join('\n');
  tempConfigStr.value.secondCandidates = config.value.secondCandidates.join('\n');
  tempConfigStr.value.bigSpaceNumbers = config.value.bigSpaceNumbers.join(', ');

  // Load Results
  const savedResults = localStorage.getItem(STORAGE_KEY);
  if (savedResults) {
    const data = JSON.parse(savedResults);
    assignments.value = data.assignments || [];
    if (data.candidates) candidates.value = data.candidates;
    if (data.secondCandidates) secondCandidates.value = data.secondCandidates;
  }
});

watch([assignments, candidates, secondCandidates], () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    assignments: assignments.value,
    candidates: candidates.value,
    secondCandidates: secondCandidates.value,
    lastUpdated: new Date().toISOString()
  }));
}, { deep: true });

watch(config, (newVal) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(newVal));
}, { deep: true });

const filteredAssignments = computed(() => {
  if (!filterQuery.value.trim()) return assignments.value;
  const q = filterQuery.value.toLowerCase();
  return assignments.value.filter(a => 
    a.unitId.toLowerCase().includes(q) || 
    a.spaceNumber.toString().includes(q)
  );
});

const isFirstRoundFinished = computed(() => candidates.value.length === 0 || assignments.value.length >= config.value.totalSpaces);
const isAllFinished = computed(() => isFirstRoundFinished.value && (secondCandidates.value.length === 0 || assignments.value.length >= config.value.totalSpaces));

const isBigSpace = (spaceNumber: number) => {
  return config.value.bigSpaceNumbers.includes(spaceNumber);
};

const drawNext = () => {
  if (isRolling.value || isAllFinished.value) return;
  isRolling.value = true;
  
  setTimeout(() => {
    const isFirstRound = candidates.value.length > 0;
    const pool = isFirstRound ? [...candidates.value] : [...secondCandidates.value];
    const newAssignments: Assignment[] = [...assignments.value];
    const startIdx = newAssignments.length;
    const countToDraw = Math.min(config.value.totalSpaces - startIdx, pool.length);

    for (let i = 0; i < countToDraw; i++) {
      const currentSpaceNum = startIdx + i + 1;
      const randomIndex = Math.floor(Math.random() * pool.length);
      const picked = pool.splice(randomIndex, 1)[0];
      
      if (picked) {
        newAssignments.push({
          spaceNumber: currentSpaceNum,
          unitId: picked,
          type: isBigSpace(currentSpaceNum) ? '大' : '小'
        });
      }
    }

    assignments.value = newAssignments;
    if (isFirstRound) {
      candidates.value = pool;
    } else {
      secondCandidates.value = pool;
    }
    isRolling.value = false;
  }, 800);
};

const reset = () => {
  if (confirm('確定要清除所有結果並重置嗎？')) {
    assignments.value = [];
    candidates.value = [...config.value.candidates];
    secondCandidates.value = [...config.value.secondCandidates];
    localStorage.removeItem(STORAGE_KEY);
    swapSelection.value = null;
  }
};

const saveConfig = () => {
  config.value.candidates = tempConfigStr.value.candidates.split('\n').map(s => s.trim()).filter(s => s);
  config.value.secondCandidates = tempConfigStr.value.secondCandidates.split('\n').map(s => s.trim()).filter(s => s);
  
  const parsedNumbers = tempConfigStr.value.bigSpaceNumbers
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));
  config.value.bigSpaceNumbers = parsedNumbers;
  tempConfigStr.value.bigSpaceNumbers = parsedNumbers.join(', '); // 格式化回去
  
  if (assignments.value.length === 0) {
    candidates.value = [...config.value.candidates];
    secondCandidates.value = [...config.value.secondCandidates];
  } else {
    alert('設定已儲存。由於已有抽選結果，名單變更將在重置後完全生效。請注意，若您更改了大車位編號，已抽出的結果類型標籤需要重置才會更新。');
  }
  showConfig.value = false;
};

const exportCSV = () => {
  const headers = ['車位編號', '車位類型', '住戶編號'];
  const rows = assignments.value.map(a => [a.spaceNumber, a.type + '車位', a.unitId]);
  
  let csvContent = "\uFEFF"; 
  csvContent += headers.join(',') + '\n';
  rows.forEach(row => csvContent += row.join(',') + '\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${config.value.title}_${new Date().toISOString().slice(0,10)}.csv`);
  link.click();
};

const getSelectionLabel = () => {
  if (!swapSelection.value) return '';
  const s = swapSelection.value;
  if (s.type === 'assigned') return `車位 ${assignments.value[s.index]?.spaceNumber}`;
  if (s.type === 'candidate') return `第一輪名單中的 ${candidates.value[s.index]}`;
  return `第二輪名單中的 ${secondCandidates.value[s.index]}`;
};

const handleSwap = (target: SwapTarget) => {
  if (!target) return;

  if (swapSelection.value === null) {
    swapSelection.value = target;
  } else {
    const s1 = swapSelection.value;
    const s2 = target;

    if (!(s1.type === s2.type && s1.index === s2.index)) {
      let val1 = '';
      let val2 = '';

      // Get values
      if (s1.type === 'assigned') val1 = assignments.value[s1.index]?.unitId || '';
      else if (s1.type === 'candidate') val1 = candidates.value[s1.index] || '';
      else val1 = secondCandidates.value[s1.index] || '';

      if (s2.type === 'assigned') val2 = assignments.value[s2.index]?.unitId || '';
      else if (s2.type === 'candidate') val2 = candidates.value[s2.index] || '';
      else val2 = secondCandidates.value[s2.index] || '';

      // Set values
      if (s1.type === 'assigned') {
        const item = assignments.value[s1.index];
        if (item) item.unitId = val2;
      } else if (s1.type === 'candidate') {
        candidates.value[s1.index] = val2;
      } else {
        secondCandidates.value[s1.index] = val2;
      }

      if (s2.type === 'assigned') {
        const item = assignments.value[s2.index];
        if (item) item.unitId = val1;
      } else if (s2.type === 'candidate') {
        candidates.value[s2.index] = val1;
      } else {
        secondCandidates.value[s2.index] = val1;
      }
    }
    swapSelection.value = null;
  }
};
</script>

<template>
  <div class="app-container">
    <header :style="{ backgroundColor: config.themeColor }">
      <div class="header-content">
        <h1>{{ config.title }}</h1>
        <button @click="showConfig = true" class="btn-config-icon" title="系統設定">⚙️</button>
      </div>
      <div class="header-stats">
        <span>大車位: {{ config.bigSpaceNumbers.length }}</span>
        <span>小車位: {{ config.totalSpaces - config.bigSpaceNumbers.length }}</span>
        <span>總名額: {{ config.totalSpaces }}</span>
      </div>
    </header>

    <!-- Config Modal -->
    <div v-if="showConfig" class="modal-overlay" @click.self="showConfig = false">
      <div class="modal-card">
        <div class="modal-header">
          <h2>系統設定</h2>
          <button @click="showConfig = false" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>系統標題</label>
            <input v-model="config.title" type="text" placeholder="輸入標題">
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>總車位數</label>
              <input v-model.number="config.totalSpaces" type="number">
            </div>
            <div class="form-group">
              <label>大車位編號 (以逗號分隔，如: 1,3,5)</label>
              <input v-model="tempConfigStr.bigSpaceNumbers" type="text" placeholder="例如: 1, 2, 3">
            </div>
          </div>
          <div class="form-group">
            <label>佈景顏色</label>
            <input v-model="config.themeColor" type="color">
          </div>
          <div class="form-group">
            <label>第一輪名單 (每行一個住戶編號)</label>
            <textarea v-model="tempConfigStr.candidates" rows="5" placeholder="例如: 70-2F"></textarea>
          </div>
          <div class="form-group">
            <label>第二輪名單 (每行一個住戶編號)</label>
            <textarea v-model="tempConfigStr.secondCandidates" rows="5" placeholder="例如: 70-2F"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="saveConfig" class="btn btn-main">儲存設定</button>
        </div>
      </div>
    </div>

    <div class="layout">
      <section class="side-panel">
        <div class="card actions-card">
          <button @click="drawNext" :disabled="isRolling || isAllFinished" class="btn btn-main">
            <template v-if="isRolling">正在隨機分配...</template>
            <template v-else-if="isAllFinished">抽選完畢</template>
            <template v-else-if="candidates.length > 0">第一輪：抽選車位</template>
            <template v-else>第二輪：抽選剩餘車位</template>
          </button>
          
          <div class="grid-2">
            <button @click="exportCSV" :disabled="assignments.length === 0" class="btn btn-outline">匯出 CSV</button>
            <button @click="reset" class="btn btn-danger">重置系統</button>
          </div>

          <div v-if="swapSelection" class="swap-active-box">
            <p>🔄 選取對象進行交換: <strong>{{ getSelectionLabel() }}</strong></p>
            <button @click="swapSelection = null" class="btn-cancel">取消交換</button>
          </div>
          <p v-else class="instruction-text">💡 點擊任何中籤車位或待抽名單可進行交換</p>
        </div>

        <div class="card candidates-card">
          <h3>第一輪待抽 ({{ candidates.length }})</h3>
          <div class="candidate-list">
            <div 
              v-for="(id, idx) in candidates" 
              :key="'c1-'+idx" 
              class="candidate-item"
              :class="{ 'swapping': swapSelection?.type === 'candidate' && swapSelection?.index === idx }"
              @click="handleSwap({ type: 'candidate', index: idx })"
            >
              {{ id }}
            </div>
          </div>
          
          <h3 style="margin-top: 1.5rem">第二輪待抽 ({{ secondCandidates.length }})</h3>
          <div class="candidate-list">
            <div 
              v-for="(id, idx) in secondCandidates" 
              :key="'c2-'+idx" 
              class="candidate-item"
              :class="{ 'swapping': swapSelection?.type === 'secondCandidate' && swapSelection?.index === idx }"
              @click="handleSwap({ type: 'secondCandidate', index: idx })"
            >
              {{ id }}
            </div>
          </div>
        </div>
      </section>

      <section class="main-panel">
        <div class="card result-card">
          <div class="result-header">
            <h3>車位分配結果</h3>
            <div class="header-actions">
              <div v-if="assignments.length > 0" class="search-box">
                <input v-model="filterQuery" type="text" placeholder="搜尋車位或住戶...">
                <span v-if="filterQuery" @click="filterQuery = ''" class="search-clear">×</span>
              </div>
              <div class="legend">
                <span class="legend-item"><i class="dot big"></i> 大車位</span>
                <span class="legend-item"><i class="dot small"></i> 小車位</span>
              </div>
            </div>
          </div>

          <div class="result-grid">
            <div 
              v-for="(a, idx) in filteredAssignments" 
              :key="a.spaceNumber" 
              class="space-item"
              :class="[a.type === '大' ? 'type-big' : 'type-small', { 'swapping': swapSelection?.type === 'assigned' && swapSelection?.index === idx }]"
              @click="handleSwap({ type: 'assigned', index: idx })"
            >
              <div class="space-badge">{{ a.type }}</div>
              <div class="space-info">
                <span class="no">#{{ a.spaceNumber }}</span>
                <span class="unit">{{ a.unitId }}</span>
              </div>
            </div>

            <template v-if="!filterQuery">
              <div 
                v-for="i in Math.max(0, config.totalSpaces - assignments.length)" 
                :key="'empty-'+i" 
                class="space-item empty"
                :class="isBigSpace(assignments.length + i) ? 'type-big' : 'type-small'"
              >
                <div class="space-badge">{{ isBigSpace(assignments.length + i) ? '大' : '小' }}</div>
                <div class="space-info">
                  <span class="no">#{{ assignments.length + i }}</span>
                  <span class="unit">待抽</span>
                </div>
              </div>
            </template>
            <div v-else-if="filteredAssignments.length === 0" class="no-results">
              <p>找不到符合「{{ filterQuery }}」的結果</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
:root {
  --big-color: #3b82f6;
  --small-color: #10b981;
  --bg: #f1f5f9;
}

body { margin: 0; background: var(--bg); font-family: system-ui, -apple-system, sans-serif; }
.app-container { min-height: 100vh; }

header { color: white; padding: 2rem; text-align: center; position: relative; }
.header-content { display: flex; align-items: center; justify-content: center; gap: 1rem; }
.btn-config-icon { background: rgba(255,255,255,0.2); border: none; color: white; font-size: 1.2rem; cursor: pointer; padding: 0.5rem; border-radius: 50%; transition: 0.2s; line-height: 1; }
.btn-config-icon:hover { background: rgba(255,255,255,0.3); }

.header-stats { display: flex; justify-content: center; gap: 2rem; margin-top: 1rem; opacity: 0.9; font-size: 0.9rem; }

/* Modal Styles */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.modal-card { background: white; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); }
.modal-header { padding: 1.5rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
.modal-header h2 { margin: 0; font-size: 1.25rem; color: #1e293b; }
.btn-close { background: none; border: none; font-size: 2rem; color: #94a3b8; cursor: pointer; line-height: 1; }
.modal-body { padding: 1.5rem; overflow-y: auto; flex-grow: 1; }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #e2e8f0; }

.form-group { margin-bottom: 1.2rem; }
.form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 0.4rem; }
.form-group input[type="text"], .form-group input[type="number"], .form-group textarea { width: 100%; padding: 0.6rem; border: 1px solid #cbd5e0; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; }
.form-group input[type="color"] { width: 100%; height: 40px; border: 1px solid #cbd5e0; border-radius: 8px; padding: 2px; cursor: pointer; }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; max-width: 1400px; margin: 1.5rem auto; padding: 0 1rem; }

.card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.actions-card { position: sticky; top: 1.5rem; }

.btn { width: 100%; padding: 0.8rem; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; }
.btn-main { background: #2563eb; color: white; margin-bottom: 1rem; font-size: 1.1rem; }
.btn-main:disabled { background: #94a3b8; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.btn-outline { background: white; border: 1px solid #cbd5e0; color: #475569; }
.btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

.instruction-text { font-size: 0.85rem; color: #64748b; text-align: center; margin-top: 1rem; }
.swap-active-box { margin-top: 1rem; padding: 1rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; color: #92400e; font-size: 0.9rem; }
.btn-cancel { background: none; border: none; color: #2563eb; font-weight: bold; cursor: pointer; text-decoration: underline; }

.candidates-card { margin-top: 1.5rem; }
.candidate-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; max-height: 400px; overflow-y: auto; padding-right: 0.5rem; }
.candidate-item { background: #f8fafc; padding: 0.5rem; border-radius: 6px; text-align: center; font-size: 0.9rem; cursor: pointer; border: 1px solid transparent; }
.candidate-item:hover { background: #e2e8f0; }
.candidate-item.swapping { border-color: #3b82f6; background: #eff6ff; animation: pulse 1s infinite; }

.result-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
.header-actions { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; flex-grow: 1; justify-content: flex-end; }
.search-box { position: relative; width: 240px; }
.search-box input { width: 100%; padding: 0.5rem 2rem 0.5rem 0.8rem; border: 1px solid #cbd5e0; border-radius: 8px; font-size: 0.9rem; box-sizing: border-box; }
.search-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #94a3b8; cursor: pointer; font-size: 1.2rem; }

.legend { display: flex; gap: 1rem; font-size: 0.85rem; background: #f8fafc; padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid #e2e8f0; }
.legend-item { display: flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.big { background: var(--big-color); }
.dot.small { background: var(--small-color); }

.result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }
.no-results { grid-column: 1 / -1; padding: 3rem; text-align: center; color: #64748b; background: #f8fafc; border-radius: 12px; }

.space-item { border-radius: 10px; border: 2px solid transparent; cursor: pointer; transition: 0.2s; overflow: hidden; position: relative; }
.space-item:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.space-item.swapping { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2); animation: pulse 1s infinite; }

.space-badge { font-size: 0.7rem; font-weight: bold; color: white; padding: 2px 8px; position: absolute; top: 0; right: 0; border-bottom-left-radius: 8px; z-index: 1; }

.type-big { background: #eff6ff; border-color: #dbeafe; }
.type-big .space-badge { background: var(--big-color); }
.type-big .no { color: var(--big-color); }

.type-small { background: #ecfdf5; border-color: #d1fae5; }
.type-small .space-badge { background: var(--small-color); }
.type-small .no { color: var(--small-color); }

.space-info { padding: 1.2rem 0.8rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.no { font-size: 0.75rem; font-weight: bold; }
.unit { font-size: 1.2rem; font-weight: 800; }

.empty { opacity: 0.4; border-style: dashed; cursor: default; }
.empty:hover { transform: none; box-shadow: none; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

@media (max-width: 1024px) {
  .layout { grid-template-columns: 1fr; }
  .actions-card { position: static; }
  .result-header { flex-direction: column; align-items: stretch; }
  .header-actions { flex-direction: column; align-items: stretch; gap: 1rem; }
  .search-box { width: 100%; }
  .legend { justify-content: center; }
}
</style>
