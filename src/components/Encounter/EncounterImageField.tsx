import { useEffect, useRef, useState } from 'react'
import { Crop, ImagePlus, Link2, Trash2 } from 'lucide-react'
import { EncounterImage } from '@/components/Encounter/EncounterImage'
import { EncounterImageCropModal } from '@/components/Encounter/EncounterImageCropModal'
import { readFileAsDataUrl } from '@/lib/imageCrop'
import { Button, Input } from '@/components/ui/Button'

interface EncounterImageFieldProps {
  value: string | null
  onChange: (url: string | null) => void
  previewAlt?: string
}

export function EncounterImageField({ value, onChange, previewAlt = 'Превью сцены' }: EncounterImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState(value?.startsWith('http') ? value : '')

  useEffect(() => {
    if (value?.startsWith('http')) setUrlDraft(value)
    else if (!value) setUrlDraft('')
  }, [value])

  async function handleFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const dataUrl = await readFileAsDataUrl(file)
    setCropSrc(dataUrl)
  }

  function openCropFromUrl() {
    const url = urlDraft.trim()
    if (!url) return
    setCropSrc(url)
  }

  function applyUrlWithoutCrop() {
    const url = urlDraft.trim()
    onChange(url || null)
  }

  return (
    <div className="vng-encounter-image-field">
      <span className="vng-tui-field__label block mb-1">Картинка сцены</span>

      <div className="vng-encounter-image-field__toolbar flex flex-wrap gap-2 mb-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={14} /> Загрузить файл
        </Button>
        {value && (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCropSrc(value)}>
              <Crop size={14} /> Обрезать
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              <Trash2 size={14} /> Убрать
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            label="Или ссылка (URL)"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" size="sm" variant="secondary" onClick={openCropFromUrl} disabled={!urlDraft.trim()}>
            <Crop size={14} /> Обрезать URL
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={applyUrlWithoutCrop} disabled={!urlDraft.trim()}>
            <Link2 size={14} /> Без обрезки
          </Button>
        </div>
      </div>

      {value ? (
        <EncounterImage src={value} alt={previewAlt} size="editor" />
      ) : (
        <p className="vng-encounter-image-field__empty text-xs text-vng-muted">
          Загрузите файл и обрежьте в рамке 16:9 — или вставьте ссылку и нажмите «Обрезать URL».
        </p>
      )}

      {cropSrc && (
        <EncounterImageCropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onApply={(dataUrl) => {
            onChange(dataUrl)
            setUrlDraft('')
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}
