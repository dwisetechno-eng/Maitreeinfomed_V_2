'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderInput, FolderMinus, Layers, Search } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import {
  getArticleBatchId,
  getArticleBatchTag,
  getArticleTitle,
  withArticleBatchMeta,
  type ArticleRequestRow,
} from '@/lib/article-request-meta'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/client'

export type BatchManageArticle = {
  id: string
  client_id?: string | null
  article_description?: string | null
  article_title?: string | null
  notes: string | null
  batch_id?: string | null
  batch_tag?: string | null
  created_at?: string | null
}

type BatchGroup = {
  id: string
  label: string
  count: number
}

type Props = {
  open: boolean
  onClose: () => void
  articles: BatchManageArticle[]
  clientNames?: Map<string, string>
  onUpdated: (message: string) => void | Promise<void>
}

type Action = 'reassign' | 'remove'

const NEW_BATCH = '__new__'

export function BatchManageDialog({
  open,
  onClose,
  articles,
  clientNames,
  onUpdated,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<Action>('reassign')
  const [targetBatch, setTargetBatch] = useState('')
  const [newBatchName, setNewBatchName] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedIds(new Set())
    setAction('reassign')
    setTargetBatch('')
    setNewBatchName('')
    setQuery('')
    setError(null)
  }, [open])

  const batches = useMemo(() => {
    const groups = new Map<string, BatchGroup>()

    for (const article of articles) {
      const id = getArticleBatchId(article as ArticleRequestRow)

      if (!id) {
        continue
      }

      const existing = groups.get(id)

      if (existing) {
        existing.count += 1
      } else {
        groups.set(id, {
          id,
          label:
            getArticleBatchTag(article as ArticleRequestRow) ??
            `Batch ${id.slice(0, 8).toUpperCase()}`,
          count: 1,
        })
      }
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [articles])

  const filteredArticles = useMemo(() => {
    const term = query.trim().toLowerCase()

    if (!term) {
      return articles
    }

    return articles.filter((article) => {
      const batch =
        getArticleBatchTag(article as ArticleRequestRow) ??
        getArticleBatchId(article as ArticleRequestRow) ??
        ''

      return [
        getArticleTitle(article as ArticleRequestRow),
        batch,
        clientNames?.get(article.client_id ?? '') ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [articles, clientNames, query])

  const selectedArticles = useMemo(
    () => articles.filter((article) => selectedIds.has(article.id)),
    [articles, selectedIds]
  )

  const allVisibleSelected =
    filteredArticles.length > 0 &&
    filteredArticles.every((article) => selectedIds.has(article.id))

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setError(null)
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (allVisibleSelected) {
        for (const article of filteredArticles) {
          next.delete(article.id)
        }
      } else {
        for (const article of filteredArticles) {
          next.add(article.id)
        }
      }

      return next
    })
    setError(null)
  }

  async function handleApply() {
    if (selectedArticles.length === 0) {
      setError('Select at least one article request.')
      return
    }

    let batchId: string | null = null
    let batchTag: string | null = null

    if (action === 'reassign') {
      if (targetBatch === NEW_BATCH) {
        batchTag = newBatchName.trim()

        if (!batchTag) {
          setError('Enter a name for the new batch.')
          return
        }

        batchId = createBatchId()
      } else if (targetBatch) {
        const batch = batches.find((item) => item.id === targetBatch)

        if (!batch) {
          setError('The selected batch no longer exists.')
          return
        }

        batchId = batch.id
        batchTag = batch.label
      } else {
        setError('Choose the batch these requests should move to.')
        return
      }
    }

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()

      for (const article of selectedArticles) {
        const nextNotes = withArticleBatchMeta(
          article.notes,
          batchId,
          batchTag
        )
        const payload: Record<string, unknown> = {
          batch_id: batchId,
          batch_tag: batchTag,
        }

        if (nextNotes !== article.notes) {
          payload.notes = nextNotes
        }

        let result = await supabase
          .from('article_requests')
          .update(payload)
          .eq('id', article.id)

        if (result.error && isMissingColumnError(result.error)) {
          if (nextNotes === article.notes) {
            throw result.error
          }

          result = await supabase
            .from('article_requests')
            .update({ notes: nextNotes })
            .eq('id', article.id)
        }

        if (result.error) {
          throw result.error
        }
      }

      await onUpdated(
        action === 'remove'
          ? `${selectedArticles.length} article request${
              selectedArticles.length === 1 ? '' : 's'
            } removed from their batch.`
          : `${selectedArticles.length} article request${
              selectedArticles.length === 1 ? '' : 's'
            } moved to “${batchTag}”.`
      )
      onClose()
    } catch (submitError) {
      setError(
        getErrorMessage(submitError, 'Unable to update the selected article requests.')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) {
          onClose()
        }
      }}
      size="4xl"
      title="Manage batches"
      description="Select requests to remove them from their current batch or move them into a different batch."
      footer={
        <div className="space-y-3">
          {error && (
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {selectedArticles.length} of {articles.length} request
              {articles.length === 1 ? '' : 's'} selected
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={saving || selectedArticles.length === 0}
                className={primaryButtonClass}
              >
                {saving ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : action === 'remove' ? (
                  <FolderMinus className="h-4 w-4" />
                ) : (
                  <FolderInput className="h-4 w-4" />
                )}
                {saving
                  ? 'Saving…'
                  : action === 'remove'
                    ? 'Remove from batch'
                    : 'Move to batch'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setAction('reassign')
              setError(null)
            }}
            aria-pressed={action === 'reassign'}
            className={actionCardClass(action === 'reassign')}
          >
            <FolderInput className="h-5 w-5" />
            <span className="text-left">
              <span className="block text-sm font-semibold">Reassign to a batch</span>
              <span className="mt-0.5 block text-xs font-normal opacity-80">
                Move the selected requests into a new or existing batch.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAction('remove')
              setError(null)
            }}
            aria-pressed={action === 'remove'}
            className={actionCardClass(action === 'remove')}
          >
            <FolderMinus className="h-5 w-5" />
            <span className="text-left">
              <span className="block text-sm font-semibold">Remove from batch</span>
              <span className="mt-0.5 block text-xs font-normal opacity-80">
                Clear the batch details and leave the requests ungrouped.
              </span>
            </span>
          </button>
        </div>

        {action === 'reassign' && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="batch-target" className={labelClass}>
                Destination batch
              </label>
              <select
                id="batch-target"
                value={targetBatch}
                onChange={(event) => {
                  setTargetBatch(event.target.value)
                  setError(null)
                }}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Select a batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.label} ({batch.count})
                  </option>
                ))}
                <option value={NEW_BATCH}>Create a new batch…</option>
              </select>
            </div>

            <div>
              <label htmlFor="batch-name" className={labelClass}>
                New batch name
              </label>
              <input
                id="batch-name"
                value={newBatchName}
                onChange={(event) => {
                  setNewBatchName(event.target.value)
                  setError(null)
                }}
                disabled={saving || targetBatch !== NEW_BATCH}
                maxLength={80}
                placeholder="e.g. Nov-26 Batch 3"
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}
              />
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Layers className="h-3.5 w-3.5" />
              Article requests
            </p>

            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search article, client or batch"
                aria-label="Search article requests"
                className={`${inputClass} py-1.5 pl-8 text-xs`}
              />
            </div>
          </div>

          <div className="max-h-[42vh] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Article requests for batch management</caption>
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select all visible article requests"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Article
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Current batch
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredArticles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                      No article requests match this search.
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map((article) => {
                    const selected = selectedIds.has(article.id)
                    const batchLabel = getArticleBatchTag(article as ArticleRequestRow)
                    const batchId = getArticleBatchId(article as ArticleRequestRow)

                    return (
                      <tr
                        key={article.id}
                        className={selected ? 'bg-brand-50/60' : 'transition-colors hover:bg-slate-50/70'}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRow(article.id)}
                            aria-label={`Select ${getArticleTitle(article as ArticleRequestRow)}`}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="max-w-[20rem] px-3 py-2.5">
                          <p className="truncate font-medium text-slate-900">
                            {getArticleTitle(article as ArticleRequestRow)}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {article.client_id
                            ? clientNames?.get(article.client_id) ?? 'Unknown client'
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {batchLabel || batchId ? (
                            <span className="inline-flex max-w-48 truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                              {batchLabel ??
                                `Batch ${(batchId ?? '').slice(0, 8).toUpperCase()}`}
                            </span>
                          ) : (
                            <span className="text-slate-400">Ungrouped</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function actionCardClass(active: boolean) {
  return [
    'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active
      ? 'border-brand-300 bg-brand-50 text-brand-800 ring-1 ring-brand-200'
      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
  ].join(' ')
}

function createBatchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}
