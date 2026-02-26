<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { config } from './config';

interface Assignment {
  spaceNumber: number;
  unitId: string;
  type: '大' | '小';
}

type SwapTarget = { type: 'assigned'; index: number } | { type: 'candidate'; index: number } | null;

const STORAGE_KEY = 'motor_pos_v2_results';
const candidates = ref([...config.candidates]);
const assignments = ref<Assignment[]>([]);
const isRolling = ref(false);
const swapSelection = ref<SwapTarget>(null);

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    assignments.value = data.assignments || [];
    const assignedIds = new Set(assignments.value.map(a => a.unitId));
    candidates.value = config.candidates.filter(id => !assignedIds.has(id));
  }
});

watch(assignments, (newVal) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    assignments: newVal,
    candidates: candidates.value,
    lastUpdated: new Date().toISOString()
  }));
}, { deep: true });

const isFinished = computed(() => assignments.value.length >= config.totalSpaces);

const drawAll = () => {
  if (isRolling.value || isFinished.value) return;
  isRolling.value = true;
  
  setTimeout(() => {
    const pool = [...candidates.value];
    const newAssignments: Assignment[] = [...assignments.value];
    const startIdx = newAssignments.length;
    const countToDraw = Math.min(config.totalSpaces - startIdx, pool.length);

    for (let i = 0; i < countToDraw; i++) {
      const currentSpaceNum = startIdx + i + 1;
      const randomIndex = Math.floor(Math.random() * pool.length);
      const picked = pool.splice(randomIndex, 1)[0];
      
      newAssignments.push({
        spaceNumber: currentSpaceNum,
        unitId: picked,
        type: currentSpaceNum <= config.bigSpacesCount ? '大' : '小'
      });
    }

    assignments.value = newAssignments;
    candidates.value = pool;
    isRolling.value = false;
  }, 800);
};

const handleSwap = (target: SwapTarget) => {
  if (!target) return;

  if (swapSelection.value === null) {
    swapSelection.value = target;
  } else {
    const s1 = swapSelection.value;
    const s2 = target;

    if (!(s1.type === s2.type && s1.index === s2.index)) {
      let val1: string, val2: string;

      // Get values
      if (s1.type === 'assigned') val1 = assignments.value[s1.index].unitId;
      else val1 = candidates.value[s1.index];

      if (s2.type === 'assigned') val2 = assignments.value[s2.index].unitId;
      else val2 = candidates.value[s2.index];

      // Set values
      if (s1.type === 'assigned') assignments.value[s1.index].unitId = val2;
      else candidates.value[s1.index] = val2;

      if (s2.type === 'assigned') assignments.value[s2.index].unitId = val1;
      else candidates.value[s2.index] = val1;
    }
    swapSelection.value = null;
  }
};

const reset = () => {
  if (confirm('確定要清除所有結果並重置嗎？')) {
    assignments.value = [];
    candidates.value = [...config.candidates];
    localStorage.removeItem(STORAGE_KEY);
    swapSelection.value = null;
  }
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
  link.setAttribute("download", `車位抽選結果_${new Date().toISOString().slice(0,10)}.csv`);
  link.click();
};

const getSelectionLabel = () => {
  if (!swapSelection.value) return '';
  const s = swapSelection.value;
  if (s.type === 'assigned') return `車位 ${assignments.value[s.index].spaceNumber}`;
  return `未中籤名單中的 ${candidates.value[s.index]}`;
};
</script>

<template>
  <div class="app-container">
    <header :style="{ backgroundColor: config.themeColor }">
      <h1>{{ config.title }}</h1>
      <div class="header-stats">
        <span>大車位: {{ config.bigSpacesCount }}</span>
        <span>小車位: {{ config.totalSpaces - config.bigSpacesCount }}</span>
        <span>總名額: {{ config.totalSpaces }}</span>
      </div>
    </header>

    <div class="layout">
      <section class="side-panel">
        <div class="card actions-card">
          <button @click="drawAll" :disabled="isRolling || isFinished" class="btn btn-main">
            {{ isRolling ? '正在隨機分配...' : (isFinished ? '抽選完畢' : '一次抽出所有車位') }}
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
          <h3>未中籤名單 ({{ candidates.length }})</h3>
          <div class="candidate-list">
            <div 
              v-for="(id, idx) in candidates" 
              :key="id" 
              class="candidate-item"
              :class="{ 'swapping': swapSelection?.type === 'candidate' && swapSelection?.index === idx }"
              @click="handleSwap({ type: 'candidate', index: idx })"
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
            <div class="legend">
              <span class="legend-item"><i class="dot big"></i> 大車位</span>
              <span class="legend-item"><i class="dot small"></i> 小車位</span>
            </div>
          </div>

          <div class="result-grid">
            <div 
              v-for="(a, idx) in assignments" 
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

            <div 
              v-for="i in (config.totalSpaces - assignments.length)" 
              :key="'empty-'+i" 
              class="space-item empty"
              :class="(assignments.length + i) <= config.bigSpacesCount ? 'type-big' : 'type-small'"
            >
              <div class="space-badge">{{ (assignments.length + i) <= config.bigSpacesCount ? '大' : '小' }}</div>
              <div class="space-info">
                <span class="no">#{{ assignments.length + i }}</span>
                <span class="unit">待抽</span>
              </div>
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

header { color: white; padding: 2rem; text-align: center; }
.header-stats { display: flex; justify-content: center; gap: 2rem; margin-top: 1rem; opacity: 0.9; font-size: 0.9rem; }

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

.result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.legend { display: flex; gap: 1rem; font-size: 0.85rem; }
.legend-item { display: flex; align-items: center; gap: 0.4rem; }
.dot { width: 10rem; width: 8px; height: 8px; border-radius: 50%; }
.dot.big { background: var(--big-color); }
.dot.small { background: var(--small-color); }

.result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }

.space-item { border-radius: 10px; border: 2px solid transparent; cursor: pointer; transition: 0.2s; overflow: hidden; position: relative; }
.space-item:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.space-item.swapping { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2); animation: pulse 1s infinite; }

.space-badge { font-size: 0.7rem; font-weight: bold; color: white; padding: 2px 8px; position: absolute; top: 0; right: 0; border-bottom-left-radius: 8px; }

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
}
</style>
