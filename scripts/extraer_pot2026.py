"""Extrae del Proyecto de Acuerdo de la revisión del POT de Medellín (Tomo V, versión 3, julio de 2026) las tablas
de aprovechamientos urbanísticos por polígono (art. 280) y de aprovechamientos adicionales por venta de derechos (art. 294).

Uso: pdftotext -layout 13_Tomo_V_Proyecto-de-Acuerdo.pdf pa.txt  &&  python scripts/extraer_pot2026.py pa.txt data/normas/medellin_pot2026_v3.csv
Fuente: https://www.medellin.gov.co/es/wp-content/uploads/2026/07/13_Tomo_V_Proyecto-de-Acuerdo.pdf
"""
import csv, re, sys

lineas = open(sys.argv[1], encoding="utf8", errors="ignore").read().splitlines()
num = lambda s: float(s.replace(",", "."))

base = re.compile(r"^\s*(Z\d+_[A-Z]+\d?_\d+)\s+(\d+)\s+(\d+)%\s+(\d+)%\s+(\d+)%\s+(\d+)%\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s*$")
adic = re.compile(r"^\s*(Z\d+_[A-Z]+\d?_\d+)\s+(\d+)\s+(\d+,\d+)\s*$")

filas = {}
for i, l in enumerate(lineas):
    m = base.match(l)
    if m and m.group(1) not in filas:
        g = m.groups()
        filas[g[0]] = {
            "codigo": g[0], "densidad_viv_ha": int(g[1]),
            "io_baja_mixtura_lote_menor_2000": int(g[2]) / 100, "io_baja_mixtura_lote_mayor_2000": int(g[3]) / 100,
            "io_media_mixtura": int(g[4]) / 100, "io_alta_mixtura": int(g[5]) / 100,
            "ic_residencial": num(g[6]), "ic_otros_usos_baja": num(g[7]), "ic_otros_usos_media": num(g[8]), "ic_otros_usos_alta": num(g[9]),
            "densidad_adicional_viv_ha": "", "ic_adicional": "", "linea_texto": i + 1,
        }

# Tabla del art. 294 (derechos adicionales): solo filas donde código y valores quedaron en la misma línea.
# (el título aparece primero en el índice; se recorre todo el texto: el patrón código-entero-decimal solo aparece en esa tabla)
for l in lineas:
    m = adic.match(l)
    if m and m.group(1) in filas:
        filas[m.group(1)]["densidad_adicional_viv_ha"] = int(m.group(2))
        filas[m.group(1)]["ic_adicional"] = num(m.group(3))

with open(sys.argv[2], "w", newline="", encoding="utf8") as f:
    w = csv.DictWriter(f, fieldnames=list(next(iter(filas.values())).keys()))
    w.writeheader()
    for k in sorted(filas):
        w.writerow(filas[k])
print(f"{len(filas)} polígonos, {sum(1 for r in filas.values() if r['ic_adicional'] != '')} con derechos adicionales")
