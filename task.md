# Content Pipeline Implementation Tasks

## Component 1: Content Intake Router
- [ ] Extend `decision.ts` with content-mode routing
- [ ] Add content-specific complexity hints
- [ ] Unit tests for content routing decisions

## Component 2: Content Pipeline Stages
- [ ] Add `CONTENT_PIPELINE_STAGES` to pipeline.ts
- [ ] Create `src/lib/content/content-pipeline.ts`
- [ ] Stage output types for content artifacts

## Component 3: Content Adapters
- [ ] Create `src/lib/content/adapters/types.ts`
- [ ] Create `content-researcher-adapter.ts`
- [ ] Create `content-writer-adapter.ts`
- [ ] Create `content-editor-adapter.ts`
- [ ] Create `content-publisher-adapter.ts`

## Component 4: Content Worker Loop
- [ ] Create `src/lib/content/content-reconcile-loop.ts`
- [ ] Register loop in runner-worker.ts

## Component 5: Publisher Integration
- [ ] Create `src/lib/content/publishers/markdown-publisher.ts`
- [ ] Create `src/lib/content/publishers/types.ts`
- [ ] Create placeholder publishers for X/Telegram/Notion

## Component 6: Schema & API
- [ ] Add `taskKind = "content"` support to schema
- [ ] Content-specific API routes
- [ ] Dashboard integration
