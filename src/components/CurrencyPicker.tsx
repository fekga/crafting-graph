import { rememberPickedItem } from '../data/itemArt'
import ItemArtBrowser from './ItemArtBrowser'

export type PickResult = { name: string; path?: string }

type Props = {
  onPick: (result: PickResult) => void
  onClose: () => void
  /** Heading shown in the modal, so it's clear which field is being set
   * (action, a note's inline icon, or a step's cost currency). */
  title?: string
}

export default function CurrencyPicker({ onPick, onClose, title = 'Choose an icon' }: Props) {
  function handlePick(path: string, label: string) {
    rememberPickedItem(label, path)
    onPick({ name: label, path })
  }

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button (or a completed action)
      // should.
    >
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <p className="muted picker-browse-hint">
          Every 2D item icon from the game, sourced from{' '}
          <a href="https://repoe-fork.github.io/Art/2DItems/" target="_blank" rel="noreferrer">
            repoe-fork.github.io
          </a>
          . Search across everything, or browse by category.
        </p>
        <ItemArtBrowser onPick={handlePick} />
      </div>
    </div>
  )
}
