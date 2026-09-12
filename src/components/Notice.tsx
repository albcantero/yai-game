// NOTIFICACIÓN reutilizable: el popup Win98 de "Información" (pantalla oscurecida + ventana con icono
// msg_information + botón "Cerrar"). Extraído de Computer.tsx para reutilizarlo con distintos textos: el botón
// "i" de la barra, los avisos de nuevos puzzles / Fax, el futuro "Recoger objeto"... El texto llega por props.
type NoticeProps = {
  text: string;          // cuerpo del aviso
  title?: string;        // barra de título (por defecto "Información")
  onClose: () => void;   // cerrar (la "X" de la barra y el botón "Cerrar")
};

export default function Notice({ text, title = "Información", onClose }: NoticeProps) {
  return (
    <div className="win98 confirm-overlay">
      <div className="window confirm-dialog">
        <div className="title-bar">
          <img className="title-icon" src="/icons/msg_information-2.png" alt="" />
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" onClick={onClose}></button>
          </div>
        </div>
        <div className="window-body">
          <div className="confirm-row">
            <img className="confirm-icon" src="/icons/msg_information-0.png" alt="" />
            <p>{text}</p>
          </div>
          <div className="confirm-buttons">
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
