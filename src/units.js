// Display conversion only: physics and saved race state remain in km/h.
export const speedValue=(kph,unit="kph")=>unit==="mph" ? kph/1.609344 : kph;
export const speedUnitLabel=(unit="kph")=>unit==="mph" ? "mph" : "km/h";
export const formatSpeed=(kph,unit="kph")=>`${Math.round(speedValue(kph,unit))} ${speedUnitLabel(unit)}`;
export const speedText=(text,unit="kph")=>String(text).replace(/(\d+(?:\.\d+)?) km\/h/gi,(_,value)=>formatSpeed(Number(value),unit));
