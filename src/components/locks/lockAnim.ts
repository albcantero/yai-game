// Constantes de animación COMPARTIDAS por los candados (Padlock y GeometryLock), para no duplicarlas.
// E_OUT: Power1.easeOut de GSAP (quad out); E_INOUT: Power2.easeInOut; SHAKE: keyframes del temblor; BTN_OUT:
// px que caen los botones al salir. Clavados del original.
export const E_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
export const E_INOUT: [number, number, number, number] = [0.645, 0.045, 0.355, 1];
export const SHAKE = [0, 10, -10, 10, 0];
export const BTN_OUT = 100;
