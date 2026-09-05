import { useState } from "react";

// Prototipo de la UI de Mensajes: lista navegable con caret, presencia y no-leidos.
// Navegacion con los botones de la barbilla (arriba / abajo / OK). Sin backend todavia.
interface Contact {
  id: string;
  name: string;
  online: boolean;
  unread: number;
}

const CONTACTS: Contact[] = [
  { id: "celia", name: "Celia", online: true, unread: 0 },
  { id: "raquel", name: "Raquel", online: false, unread: 2 },
  { id: "uxoa", name: "Uxoa", online: true, unread: 0 },
];

// Un unico chevron (el que le gusta a Alberto) rotado para arriba/abajo/derecha.
function Chevron({ dir }: { dir: "up" | "down" | "right" }) {
  const rot = dir === "up" ? -90 : dir === "down" ? 90 : 0;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" />
    </svg>
  );
}

// Icono de teclado de Pixelarticons (toggle del teclado en pantalla).
function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 5h2v14h-2v2H3v-2H1V5h2V3h18v2ZM6 17h12v-2H6v2Zm1-4h2v-2H7v2Zm4 0h2v-2h-2v2Zm4 0h2v-2h-2v2ZM5 9h2V7H5v2Zm4 0h2V7H9v2Zm4 0h2V7h-2v2Zm4 0h2V7h-2v2Z" />
    </svg>
  );
}

export default function Messages() {
  const [sel, setSel] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kbOn, setKbOn] = useState(true); // toggle visual del teclado (proto)

  const move = (d: number) => setSel((s) => (s + d + CONTACTS.length) % CONTACTS.length);
  const ok = () => {
    if (openId) setOpenId(null);
    else setOpenId(CONTACTS[sel].id);
  };

  const openContact = openId ? CONTACTS.find((c) => c.id === openId) : null;

  return (
    <div className="msg">
      {openContact ? (
        <div className="msg-chat">
          <div className="msg-chat-head">&gt; {openContact.name}</div>
          <div className="msg-chat-body muted">&mdash; sin mensajes todavia &mdash;</div>
          <button type="button" className="msg-back" onClick={() => setOpenId(null)}>
            &lt; volver
          </button>
        </div>
      ) : (
        <>
          <div className="msg-title">MENSAJES</div>
          <ul className="msg-list">
            {CONTACTS.map((c, i) => (
              <li key={c.id} className={"msg-row" + (i === sel ? " is-sel" : "")}>
                <span className="msg-caret">{i === sel ? ">" : ""}</span>
                <span className="msg-name">{c.name}</span>
                <span className={"msg-dot" + (c.online ? " on" : "")}>{c.online ? "●" : "○"}</span>
                <span className="msg-unread">{c.unread}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="msg-buttons">
        <button
          type="button"
          className={"msg-btn" + (kbOn ? " is-on" : "")}
          aria-pressed={kbOn}
          onClick={() => setKbOn((v) => !v)}
          aria-label="Teclado"
        >
          <KeyboardIcon />
        </button>
        <button type="button" className="msg-btn" onClick={() => move(-1)} aria-label="Arriba">
          <Chevron dir="up" />
        </button>
        <button type="button" className="msg-btn" onClick={() => move(1)} aria-label="Abajo">
          <Chevron dir="down" />
        </button>
        <button type="button" className="msg-btn msg-ok" onClick={ok} aria-label="OK">
          OK
        </button>
      </div>
    </div>
  );
}
