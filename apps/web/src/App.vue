<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { VueFlow } from '@vue-flow/core'
import dagre from 'dagre'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const DAEMON_URL = 'http://localhost:3000'

const tasks = ref<any[]>([])
const connectionStatus = ref('Connecting...')
const sseSource = ref<EventSource | null>(null)
const budgetData = ref<any[]>([])

const fetchTasks = async () => {
  try {
    const res = await fetch(`${DAEMON_URL}/tasks`)
    if (res.ok) tasks.value = await res.json()
  } catch (e) { console.error('Failed to fetch tasks', e) }
}

const fetchBudget = async () => {
  try {
    const res = await fetch(`${DAEMON_URL}/budget`)
    if (res.ok) budgetData.value = await res.json()
  } catch (e) { console.error('Failed to fetch budget', e) }
}

const handleApprove = async (taskId: string) => {
  try {
    await fetch(`${DAEMON_URL}/tasks/${taskId}/approve`, { method: 'POST' })
    await fetchTasks()
  } catch (e) { console.error('Approve failed', e) }
}

const handleReject = async (taskId: string) => {
  try {
    await fetch(`${DAEMON_URL}/tasks/${taskId}/reject`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'Rejected via Web UI' })
    })
    await fetchTasks()
  } catch (e) { console.error('Reject failed', e) }
}

const setupSSE = () => {
  const evtSource = new EventSource(`${DAEMON_URL}/events`)
  
  evtSource.onopen = () => { connectionStatus.value = 'Connected' }
  evtSource.onerror = () => { connectionStatus.value = 'Disconnected' }
  
  const refresh = () => { fetchTasks(); fetchBudget() }
  
  evtSource.addEventListener('task.started', refresh)
  evtSource.addEventListener('task.completed', refresh)
  evtSource.addEventListener('task.blocked', refresh)
  evtSource.addEventListener('task.failed', refresh)

  sseSource.value = evtSource
}

onMounted(() => {
  fetchTasks()
  fetchBudget()
  setupSSE()
})

onUnmounted(() => {
  if (sseSource.value) sseSource.value.close()
})

// Convert tasks to VueFlow elements
const elements = computed(() => {
  const nodes: any[] = []
  const edges: any[] = []
  
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 })
  g.setDefaultEdgeLabel(() => ({}))
  
  tasks.value.forEach((task) => {
    nodes.push({
      id: task.id,
      position: { x: 0, y: 0 },
      label: `${task.id}\n(${task.state})`,
      style: {
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: `2px solid ${
          task.state === 'SUCCESS' ? 'var(--success)' :
          task.state === 'RUNNING' ? 'var(--accent-primary)' :
          task.state === 'BLOCKED' ? 'var(--blocked)' :
          task.state === 'FAILED' ? 'var(--danger)' : 'var(--text-tertiary)'
        }`,
        borderRadius: '8px',
        padding: '10px',
        width: '180px'
      }
    })
    
    g.setNode(task.id, { width: 180, height: 60 })
    
    if (task.dependencies) {
      task.dependencies.forEach((dep: string) => {
        edges.push({
          id: `e-${dep}-${task.id}`,
          source: dep,
          target: task.id,
          animated: task.state === 'RUNNING'
        })
        g.setEdge(dep, task.id)
      })
    }
  })
  
  dagre.layout(g)
  
  nodes.forEach(node => {
    const dagreNode = g.node(node.id)
    node.position = { x: dagreNode.x - 90, y: dagreNode.y - 30 }
  })
  
  return [...nodes, ...edges]
})
</script>

<template>
  <main id="app">
    <!-- Sidebar / Budgets -->
    <aside class="sidebar">
      <div class="glass-panel">
        <div class="card-header">
          <h2 class="title-glow">XIA Orchestrator</h2>
          <span :class="['badge', connectionStatus === 'Connected' ? 'success' : 'failed']">
            {{ connectionStatus }}
          </span>
        </div>
        
        <div class="card-body">
          <h3 style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.875rem; text-transform: uppercase;">Budget Utilization</h3>
          
          <div v-if="budgetData.length === 0" style="color: var(--text-secondary); font-size: 0.875rem;">
            No budget data yet.
          </div>
          
          <div class="stat-grid" style="grid-template-columns: 1fr;">
            <div class="stat-box" v-for="b in budgetData" :key="`${b.provider}-${b.window}`">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="stat-label">{{ b.provider }} ({{ b.window }})</span>
                <span class="stat-value" style="font-size: 1rem;">${{ (b.spent||0).toFixed(2) }} / ${{ (b.limit||0).toFixed(2) }}</span>
              </div>
              <div class="progress-bar-bg">
                <div 
                  :class="['progress-bar-fill', b.status === 'warn' ? 'warning' : b.status === 'paused' ? 'danger' : '']" 
                  :style="{ width: `${Math.min(b.pct||0, 100)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <section class="main-content" style="display: flex; flex-direction: column;">
      
      <!-- Approval Queue -->
      <div class="glass-panel" v-if="tasks.filter(t => t.state === 'BLOCKED').length > 0">
        <div class="card-header" style="border-bottom-color: rgba(249, 115, 22, 0.2);">
          <h2 style="color: var(--blocked); display: flex; align-items: center; gap: 0.5rem;">
            ⚠️ Approval Queue
            <span class="badge blocked">{{ tasks.filter(t => t.state === 'BLOCKED').length }}</span>
          </h2>
        </div>
        <div class="card-body" style="display: flex; flex-direction: column; gap: 1rem;">
          <div 
            v-for="task in tasks.filter(t => t.state === 'BLOCKED')" 
            :key="task.id"
            style="background: var(--bg-primary); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid rgba(249, 115, 22, 0.2); display: flex; justify-content: space-between; align-items: center;"
          >
            <div>
              <div style="font-weight: 500; margin-bottom: 0.25rem;">{{ task.id }}</div>
              <div style="font-size: 0.875rem; color: var(--text-secondary);">Agent: {{ task.agentId }} | Domain: {{ task.domain }}</div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-success" @click="handleApprove(task.id)">Approve</button>
              <button class="btn btn-danger" @click="handleReject(task.id)">Reject</button>
            </div>
          </div>
        </div>
      </div>

      <!-- DAG Explorer -->
      <div class="glass-panel" style="flex: 1; display: flex; flex-direction: column; min-height: 500px;">
        <div class="card-header">
          <h2>Task Explorer (DAG)</h2>
          <button class="btn btn-primary" @click="fetchTasks">Refresh</button>
        </div>
        <div class="card-body" style="flex: 1; padding: 0;">
          <div v-if="tasks.length === 0" style="text-align: center; color: var(--text-secondary); padding: 3rem 0;">
            No tasks found in the database.
          </div>
          <VueFlow v-else :nodes="elements.filter(e => !('source' in e))" :edges="elements.filter(e => ('source' in e))" fit-view-on-init class="vue-flow-dark" />
        </div>
      </div>

    </section>
  </main>
</template>

<style>
.vue-flow-dark {
  background-color: var(--bg-secondary);
}
.vue-flow__node-default {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
}
</style>
