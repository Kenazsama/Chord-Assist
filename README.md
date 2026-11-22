# Chord Assist

Arma acordes de dos maneras —tocando notas en el piano o el diapasón, o eligiendo tónica y tipo—, mira qué escalas y modos encajan, y encadénalos en una secuencia editable. El nombre se muestra en cifrado americano, todo suena por un sintetizador propio y sale por MIDI.

Interfaz en **castellano neutro** e **inglés** (botón ES / EN). App web standalone, sin build ni dependencias.

![Vista de escritorio](preview.png)

## Cómo abrirla

**Opción rápida:** doble clic en `index.html`. Funciona offline, con sonido.

**Opción recomendada** (habilita MIDI, la PWA y el desbloqueo):

```bash
cd chord-assist
python -m http.server 8080
```

y abrir <http://localhost:8080>.

## La interfaz

Arriba de todo están los atajos (**Espacio** escuchar, **↑ ↓** transportar, **Esc** detener). Debajo, la caja de **tónica + tipo de acorde** siempre visible, el **piano**, la **guitarra**, el **acorde actual** y las **escalas**.

### Formato 1 · Notas

Cada clic en el piano o el diapasón suma o saca una nota, suena, y el acorde se va nombrando solo.

- **Piano**: 3 octavas (C2–B4). Las notas elegidas quedan en ámbar con su nombre y octava.
- **Guitarra**: 12 trastes. Los puntos grandes son las notas exactas que elegiste (con su **grado**: `1`, `3`, `5`, `♭7`…). Los chicos marcan el resto de las posiciones del acorde; también se pueden tocar.
- **Cifrado**: si el acorde está invertido aparece con barra (`C/E`) y el bajo se pinta en rojo.

### Afinación y cuerdas

Cada cuerda tiene **−** y **+** a los costados para bajarla o subirla un semitono, con su nota al lado (`E4`, `D♯2`…). Abajo del diapasón:

- **－ Cuerda / ＋ Cuerda**: de 4 a 8 cuerdas.
- **−1 st / +1 st**: transporta **toda** la afinación de una vez. Para una guitarra en D♯ estándar alcanza con un clic en −1 st.
- **Estándar**: vuelve a E–A–D–G–B–E.

La afinación queda guardada en el navegador y se puede compartir por URL: `#tune=63,58,54,49,44,39`.

### Formato 2 · Tónica + tipo

Dos cajas: **tónica** (C…B) y **tipo de acorde** (46 tipos agrupados en tríadas, suspendidos, mayores, menores y dominantes). Al cambiar cualquiera, el acorde se arma y suena. Después puedes ajustarlo nota por nota en el piano o la guitarra.

## Escalas y modos

Debajo del acorde aparecen las escalas que contienen todas sus notas, de la más idiomática a la más exótica. Sobre `Cmaj7`: *Jónica*, *Lidia*, *Mayor armónica*…; sobre `C7`: *Mixolidia*, *Lidia dominante*, *Frigia dominante*…

- **Ámbar** = notas del acorde · **Verde agua** = notas de la escala que no están en el acorde · **Gris** = fuera de la escala.
- En el modo **Escalas**, los puntos del diapasón muestran el **nombre de la nota** y la tónica de la escala lleva un **punto rojo**; en **Acordes** vuelven a mostrar el grado (`1`, `3`, `5`…).
- **▶ Escala** la toca subiendo y bajando una octava (también por MIDI), con estos controles:
  - **Loop**: la repite indefinidamente (antes se cortaba en la primera vuelta, ya está corregido).
  - **Auto**: la reproduce sola cada vez que arranca un acorde o un paso de la secuencia.
  - **×1 / ×2**: duplica la velocidad de las notas.
  - **Patrón**: subida y bajada (por defecto), subida, bajada, terceras, cuartas, subir 2–bajar 1 o aleatorio. El aleatorio usa una semilla; **↺** la cambia para generar otro paseo.
  - En la secuencia, el patrón se repite durante todo el acorde y se corta justo cuando entra el siguiente (también en MIDI).
  - **−8va / +8va**: transporta la escala una octava abajo o arriba.
  - **Timbre y volumen propios**: por defecto sinusoidal al 65 %, para distinguirla del acorde.

### Acorde y escala a la vez

El motor tiene tres capas independientes (acorde, escala y secuencia): puedes dejar el acorde en **Loop** y lanzar la **escala** encima, y las dos suenan juntas. También puedes tocar la secuencia mientras practicas la escala.

**Buscador de escalas.** En la tarjeta de la guitarra hay un selector **Acordes / Escalas**:

- En **Acordes**, las sugerencias son las que contienen el acorde, con tónica en su raíz.
- En **Escalas**, agregas **3 o más notas** y te muestra **todas las escalas de cualquier tónica** que las contengan. Ejemplo: `C D E` → *C pentatónica mayor*, *A pentatónica menor*, *D egipcia*, *C jónica*, *D dórica*…

Además, la fila **Buscar** permite elegir a mano cualquier tónica y escala de la biblioteca.

### Biblioteca (37 escalas)

Los siete modos griegos, menor armónica y melódica, pentatónicas, blues, tonos enteros, disminuidas (T–S y S–T), alterada, frigia dominante, lidia dominante, locria ♮2, mayor armónica, dórica ♭2, mixolidia ♭6, lidia aumentada, aumentada, overtone, ultralocria, doble armónica, persa, egipcia, española de 8 notas, japonesa 1 y 2, iwato, hirajoshi 1 y 2, china y kumoi.

## Secuencia

- **＋ Agregar** apila el acorde **junto con la escala elegida**.
- Clic en un paso: lo carga (con su escala, su bajo y su ritmo) y lo toca.
- Cada paso tiene dos controles:
  - **×1 → ×2 → ×4 → ×8 → ×0.5 → ×0.25** = **cuántos compases** ocupa el acorde. ×0.5 dura medio compás y ×0.25 un tiempo, para acordes rápidos sin tener que subir el tempo de toda la canción.
  - **1/1 · 1/2 · 1/4 · 1/8** = **la figura con la que se golpea** dentro de esos compases: redonda (una vez por compás), blanca (dos), negra (cuatro) o corchea (ocho).
  - Ejemplo: `Emaj7 ×4` con `1/4` suena 16 veces (4 compases × 4 negras) sin tener que copiar el paso.
- **↑ ↓** para moverlo, **⧉** para copiarlo, **✎** para editarlo y **×** para borrarlo.
- Al entrar en edición el lápiz pasa a ser un **disquete 💾**: al hacer clic otra vez guarda los cambios de ese acorde y su configuración.
- El **＋** del encabezado agrega el acorde actual sin bajar hasta la tarjeta del acorde.
- **✎ Editar** carga ese acorde (con su escala y su ritmo) en el editor: cambias una nota, la escala o el ritmo y guardas con **✓ Guardar** en el mismo lugar de la secuencia. **Cancelar** o `Esc` salen sin tocar nada.
- **▶ Tocar** reproduce la secuencia al tempo del panel **desde el acorde seleccionado** en adelante (si no hay ninguno, arranca del primero); **Loop** la repite.
- **⇩ Guardar / ⇧ Abrir**: descarga la secuencia en JSON (con acordes, escalas, compases, figuras, BPM y afinación) o la vuelve a cargar.

## Metrónomo

Al lado del tempo hay dos botones:

- **Metrónomo**: alterna entre **off**, **secuencia** (solo suena mientras se reproduce la secuencia) y **siempre**. Sin acento en el primer tiempo: todos los clics suenan igual. Cuando arranca la secuencia, el clic se engancha a la misma grilla que los acordes, así no se desfasa en cada cambio.
- **1/2 BPM**: el metrónomo va a la mitad de la velocidad de los acordes.
- **Volumen**: el deslizador de al lado regula el nivel del clic.

## Tempo

El tempo va de **40 a 300 BPM** y se puede escribir el número exacto, igual que en un DAW. Afecta al acorde en loop, a la escala y a la secuencia.

## Loop del acorde

**⟳ Loop** al lado de *Escuchar* repite el acorde indefinidamente (también por MIDI): elige el acorde, activa Loop, dale ▶ y practica la escala encima.

El **volumen del acorde** tiene su propio deslizador al pie de la tarjeta: no depende del volumen general del panel de sonido.

## Atajos

| Tecla | Acción |
|---|---|
| `Espacio` | escuchar / detener el acorde |
| `P` | reproducir / detener la secuencia |
| `Enter` | agregar a la secuencia |
| `↑` `↓` | transportar el acorde |
| `Esc` | detener todo el sonido (y cerrar el modal) |

## Enlaces directos (presets por URL)

```
index.html#notes=48,52,55,59                       → Cmaj7 en el piano
index.html#type=maj13&root=2                       → Dmaj13 desde el selector
index.html#notes=48,50,52&search=scales            → buscador de escalas con C D E
index.html#seq=0:maj7:2:ionian:1|9:m7:4:dorian:0.5  → Cmaj7 2 compases en negras | Am7 4 compases en corcheas
index.html#tune=63,58,54,49,44,39                  → guitarra en D♯ estándar
index.html#lang=en                                 → interfaz en inglés
index.html#modal=1                                 → ver el modal de donaciones
```

- `notes`: notas MIDI (C4 = 60), separadas por coma
- `type`: id del diccionario (`maj`, `min`, `dom7`, `maj7`, `m7`, `m7b5`, `13s11`…)
- `root`: 0 (C) a 11 (B)
- `search`: `scales` abre el buscador de escalas
- `seq`: pasos `tónica:id:compases:escala:figura` (figura opcional: `4`, `2`, `1` o `0.5`)
- `tune`: afinación, de la 1ª cuerda a la más grave
- `lang`: `es` o `en`

## Desbloqueo y donaciones

La app es gratis. La **salida MIDI** y la **exportación JSON** se desbloquean con un código de donante.

- El desbloqueo se guarda en el navegador (`localStorage`).
- Cada 5 minutos aparece un modal recordatorio con el texto y el enlace que configures.


## Bajo

La tarjeta **Bajo** tiene su propio motor de audio y su propio canal MIDI:

- **Activar**: suma una línea de bajo con la raíz del acorde.
- **Timbre** y **volumen** propios, independientes del acorde.
- **Figura**: cada cuánto se toca la nota (1/1, 1/2, 1/4 o 1/8).
- **Duración**: cuánto suena cada nota (1/1, 1/2, 1/4 o 1/8).
- **−8va / +8va**: transporta el registro del bajo una octava, para VST que no llegan tan abajo.

Suena junto con el acorde, con la secuencia y con el loop, y también sale por MIDI (canal 3 por defecto).

Cada acorde guarda **su propia configuración de bajo** (activado, timbre, volumen, figura, duración y octava): al seleccionar ese acorde en la secuencia o en la estructura, la tarjeta se actualiza con sus valores.

## Sugerencias de acordes

La tarjeta **Sugerencias** propone acordes para seguir la progresión que tienes en la secuencia. Cada fila es una familia, de la más obvia a la más exótica:

1. **En la escala**: acordes diatónicos que todavía no usaste, ordenados por función (V, IV, vi, ii…).
2. **Dominantes**: el V7 de cada acorde de tu progresión (tensión prestada que resuelve).
3. **Intercambio modal**: acordes prestados del modo paralelo (mayor ↔ menor).
4. **Modulación**: acordes pivote y el V7 de la tonalidad de destino.
5. **De paso**: disminuidos que resuelven por semitono al acorde siguiente.

Arriba a la derecha está **Auto**: deduce la tonalidad a partir de tus acordes (le da peso al primero). Si lo apagas, puedes fijar **tónica** y **escala** a mano y las propuestas se calculan sobre esa base. Cada cuadro se puede escuchar con un clic y queda cargado en el editor, listo para **Agregar**.

## Estructura de la canción

La caja **Estructura** muestra la secuencia en horizontal, con el mismo número que cada acorde tiene en el panel: si no entran a lo ancho, siguen en el renglón de abajo (sin scroll lateral). Sirve para ver la forma completa de la canción de un vistazo.

- **＋ Sección** (arriba a la derecha): crea un **grupo vacío** con el nombre elegido. Si ya existe un Verso, la próxima vez crea «Verso 2», después «Verso 3», y lo mismo con cualquier sección.
- Dentro de cada grupo:
  - **＋** agrega a esa sección el **acorde que tienes cargado** en el editor en ese momento.
  - **−** quita el acorde seleccionado de esa sección (si no hay ninguno seleccionado, saca el último que agregaste).
  - **⧉** duplica la sección completa como «Verso 2», con su mismo color y sus acordes.
  - **← →** mueven el acorde seleccionado un lugar; **↑ ↓** mueven la sección entera antes o después.
  - **×** disuelve la sección (los acordes quedan, sin grupo).
  - El desplegable de la cabecera le cambia el nombre.
- Cada grupo se pinta con el **color de su sección** (fondo tenue, barra lateral y acordes tintados), así la forma de la canción se lee de un vistazo.
- **▶** reproduce la secuencia entera.
- Un clic en cualquier cuadrito carga y escucha ese acorde.

## Layout

Cada caja tiene dos botones arriba a la derecha:

- **▲**: la sube un lugar; si ya está arriba de todo, vuelve al final (loop).
- **▼**: la baja un lugar (si está al final, vuelve al principio).
- **– / +**: la colapsa o la despliega. Minimizada conserva el título, como el panel MIDI.

El orden y el estado de cada caja se guardan en el navegador.

## Canales MIDI

Cada capa sale por su propio canal, configurable en el panel MIDI:

- **Acorde** (1 por defecto): el acorde y los pasos de la secuencia.
- **Escala** (2): la melodía de la escala.
- **Bajo** (3): la línea de bajo, cuando la activas en su tarjeta.
- **Batería** (10, el canal de percusión General MIDI).

Las notas se agrupan por canal, así detener una capa no corta las demás.

## Caja de ritmos

Debajo de las escalas hay un secuenciador de **8 filas × 16 columnas**: las cuatro primeras son **MIDI 1–4** (grises, sin sonido interno: pensadas para sumar platos o tambores por MIDI con la nota que elijas) y las cuatro de abajo son las de siempre:

- **Plato** (amarillo claro), **Hi-hat** (amarillo oscuro), **Redoblante** (celeste) y **Bombo** (marrón), de arriba hacia abajo.
- Cada celda se activa con un clic. **Columnas** elige hasta dónde llega el patrón (4, 8, 12 o 16) y **×1 / ×2** duplica la velocidad.
- **▶** escucha el ritmo en loop; **Limpiar** lo vacía.
- **Volumen** propio y **Mudo**: mutea el ritmo (audio y MIDI) sin perder lo editado.
- Cada fila tiene su **nota MIDI** editable (MIDI 1–4: 46, 51, 39 y 37; plato 49, hi-hat 42, redoblante 38 y bombo 36) y sale por el canal de batería, lista para un VST. Las notas se guardan con el patrón de cada acorde.
- Incluye un motor de sonido básico (bombo, redoblante, hi-hat y plato) para escucharlo sin DAW.
- El ritmo **se guarda con cada acorde** en la secuencia, igual que la escala, y viaja en el JSON.

## Límites conocidos

- **Web MIDI** requiere `localhost` o `https`; con `file://` el botón avisa y no funciona.
- La salida MIDI manda el acorde en bloque, no reproduce el rasgueo exacto del sintetizador.
- Algunas escalas exóticas tienen variantes según el libro de referencia.
- El audio del navegador tiene ~10 ms de latencia: ideal para practicar, no para grabación sample-accurate.

