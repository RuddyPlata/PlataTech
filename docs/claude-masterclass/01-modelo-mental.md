# 1. Modelo mental

## Claude Code no es un chat

Es un bucle:

```
leer contexto → elegir herramienta → ejecutar → observar resultado → repetir
                                                        ↑____________|
```

El bucle corre solo hasta que Claude decide que terminó. Tú no controlas
los pasos intermedios; controlas **tres puntos de entrada**:

1. **Qué hay en el contexto** cuando arranca.
2. **Qué instrucción** le das.
3. **Qué puede verificar** por sí mismo para saber si acertó.

Todo lo demás — el "prompt engineering" bonito, los emojis, el tono — es
ruido. Si internalizas solo esto, ya estás por encima del promedio.

## Ley 1: el contexto es presupuesto, no almacén

Cada resultado de herramienta se queda en el contexto **para siempre**
(hasta que se compacta). No es una consulta que se descarta: es un depósito
permanente de tokens.

Ejemplo real de este repo:

```bash
cat shop/assets/products.js          # 2.541 líneas ≈ 35k tokens. Para siempre.
cat shop/assets/products-static.js   # 3.499 líneas ≈ 48k tokens. Para siempre.
```

Dos comandos y quemaste ~80k tokens para, probablemente, encontrar un
precio. Lo correcto:

```bash
grep -n "Redmi Note 13" shop/assets/products.js   # 3 líneas ≈ 60 tokens
```

**Regla:** `grep` para localizar, `sed -n '120,180p'` para leer el trozo,
`cat` solo para archivos que de verdad necesitas completos y son chicos.

El corolario importante: si necesitas que *alguien* lea mucho pero tú solo
necesitas la conclusión, eso es trabajo para un **subagente** — lee 80k
tokens en su propia ventana y te devuelve un párrafo.

## Ley 2: la verificación le gana a la instrucción

Un agente sin forma de comprobarse **adivina**. Un agente con forma de
comprobarse **converge**.

Esta es la razón real por la que Claude Code brilla en repos con tests y
falla en repos sin ellos. No es que "entienda mejor" el código con tests:
es que puede correr, ver rojo, corregir, ver verde. Sin eso, produce algo
plausible y se detiene, porque no tiene señal de error.

Este repo no tiene tests. Entonces tu trabajo es **fabricar la señal** en
cada prompt:

- «Levanta `python -m http.server 8000`, abre `/shop/product.html?sku=X` y
  confírmame que el precio renderizado es RD$X.»
- «Corre `python scripts/sync_products.py --no-download` y compara el
  `git diff` de `products.js`: debe cambiar solo el campo `price`.»
- «`grep -c "paypal" *.html shop/*.html` debe devolver 0.»

Un prompt sin criterio verificable es una apuesta. Uno con criterio es una
tarea.

## Ley 3: planificar antes de editar

Por debajo de ~2 archivos, deja que edite directo. Por encima, **exige un
plan primero**. No porque el plan sea mejor código, sino porque el plan
cuesta 2k tokens y el rework cuesta 40k.

El disparador: si no puedes predecir qué archivos va a tocar, no sabes
suficiente para dejarlo editar.

## Ley 4: una sesión, un asunto

El contexto se pudre. Después de tres tareas no relacionadas, el agente
arrastra decisiones viejas, archivos irrelevantes y errores ya resueltos —
y empieza a "recordar" cosas que ya no aplican.

`/clear` es gratis y está infrautilizado. Úsalo entre tareas. Si te da
miedo perder algo, es señal de que ese algo debería estar en un archivo,
no en el contexto (Ley 5).

## Ley 5: lo que dices dos veces se vuelve un archivo

| Lo repites... | Conviértelo en |
|---|---|
| un dato del proyecto | línea en `CLAUDE.md` |
| una secuencia de pasos | slash command en `.claude/commands/` |
| un procedimiento con criterio | skill en `.claude/skills/` |
| una regla mecánica e inviolable | hook en `settings.json` |
| una aprobación que siempre das | regla en `permissions.allow` |

Este es el ciclo de composición. Cada sesión debería dejar la siguiente un
poco más barata. Si tu sesión #50 se siente igual que la #1, no estás
componiendo: estás repitiendo.

## El error mental más caro

Creer que si el resultado fue malo, el prompt estuvo mal redactado.

Casi siempre el prompt estuvo **bien redactado y mal ubicado**: le pediste
algo correcto a un agente que no tenía el contexto para hacerlo, o no tenía
forma de saber si lo había logrado. Antes de reescribir el prompt,
pregúntate:

1. ¿Sabía *dónde* está el código? (anclas: rutas y símbolos exactos)
2. ¿Sabía qué **no** tocar? (restricciones)
3. ¿Podía comprobar el resultado? (verificación)

Arreglar cualquiera de las tres rinde más que diez reescrituras del texto.
