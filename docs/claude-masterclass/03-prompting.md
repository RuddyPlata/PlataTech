# 3. Prompting para agentes

Prompting para un agente ≠ prompting para un chat. Al chat le pides una
respuesta. Al agente le entregas una **tarea**: algo con criterio de
terminación, límites y forma de comprobarse.

## La anatomía de seis partes

Un prompt de producción tiene seis piezas. Puedes omitir alguna, pero
omítela a sabiendas.

```
1. OBJETIVO      → el resultado, no los pasos
2. ANCLAS        → rutas y símbolos exactos que ya conoces
3. RESTRICCIONES → qué NO tocar (la mitad olvidada)
4. HECHO CUANDO  → criterio observable de terminación
5. VERIFICACIÓN  → el comando concreto que lo demuestra
6. ENTREGA       → commit / diff / reporte, y en qué rama
```

### Antes y después, sobre este repo

**❌ El prompt promedio**

> arregla los precios de la tienda que están mal y súbelo

Cuatro fallos: no dice cuáles precios, no dice dónde, no dice qué es "mal",
y va a editar `products.js` — que el próximo sync sobrescribe. El agente
hará *algo*, se verá razonable, y se perderá el martes.

**✅ El mismo pedido, bien puesto**

> **Objetivo:** corregir 3 precios mal calculados en el catálogo YDC.
>
> **Anclas:** SKUs `RN13-256`, `A54-128`, `TAB-A9`. La lógica de margen
> está en `scripts/sync_products.py` (bloque de reglas de margen).
>
> **Restricciones:** NO editar `shop/assets/products.js` ni
> `products-static.js` — son generados. Las correcciones puntuales van en
> `shop/assets/products-overrides.js`. Si la causa es la regla de margen y
> no los 3 SKUs, dímelo antes de tocar el script.
>
> **Hecho cuando:** los 3 SKUs rendericen el precio con margen correcto
> según las reglas del script.
>
> **Verificación:** `grep -A3 "RN13-256" shop/assets/products-overrides.js`
> y levantar `python -m http.server 8000` para ver `/shop/product.html`.
>
> **Entrega:** un commit en `feat/fix-precios-ydc`, mostrándome el diff antes.

Segundo prompt: cero ambigüedad, imposible romper el catálogo, y verificable.

## Restricciones: la mitad que todos olvidan

La gente escribe lo que quiere y nunca lo que **no** quiere. Pero un agente
capaz, con instrucción incompleta, expande el alcance: refactoriza de paso,
"mejora" nombres, toca cinco archivos vecinos. No es desobediencia — es que
nadie dibujó el borde.

Frases que valen su peso en oro:

- «No toques nada fuera de `shop/assets/`.»
- «No refactorices código que ya funciona, aunque te parezca mejorable.»
- «No agregues dependencias. Este proyecto es vanilla a propósito.»
- «Si la solución requiere cambiar más de 3 archivos, para y explícame por qué.»
- «No commitees. Déjalo en el working tree y muéstrame el diff.»

Esa última es el freno de mano. Úsala siempre que no confíes al 100%.

## Control del esfuerzo de razonamiento

Las palabras de pensamiento escalan el presupuesto de razonamiento antes de
actuar, de menor a mayor:

```
think  <  think hard  <  think harder  <  ultrathink
```

Cuándo gastarlo:

- **Sin nada** — cambio mecánico, una sola causa posible.
- **`think`** — hay 2-3 formas de hacerlo y la elección importa.
- **`think hard`** — debugging donde el síntoma está lejos de la causa.
- **`ultrathink`** — decisiones de arquitectura, migraciones, diseño de
  seguridad. Ejemplo real aquí: *«ultrathink: cómo estructurar overrides
  para que sobrevivan a los dos syncs sin duplicar datos.»*

No lo pongas en todo. Pensar de más en una tarea trivial gasta ventana que
vas a necesitar después.

## Dar evidencia, no descripciones

El error más común en debugging:

```
❌ "el checkout está fallando"
❌ "me da un error raro cuando pago"
```

Contra:

```
✅ Pegar el error literal de la consola del navegador, con stack.
✅ Pegar el response body de la edge function.
✅ Pegar un screenshot de la pantalla rota.
✅ "Pasos: agrego SKU X al carrito → checkout → AZUL me devuelve a
    azul-callback y la orden queda en 'pending' en vez de 'paid'."
```

Tu descripción del error ya es una interpretación tuya — y si tu
interpretación fuera correcta, no necesitarías al agente. Dale el dato
crudo y deja que interprete él.

**Las imágenes cuentan como evidencia de primera.** Para trabajo de UI:
pega un screenshot de cómo se ve mal, o de cómo debería verse. Un agente
iterando contra un objetivo visual converge muchísimo más rápido que uno
leyendo tu descripción de un layout.

## Tokens de control

Frases cortas con efecto desproporcionado sobre el bucle:

| Frase | Efecto |
|---|---|
| «No escribas código todavía.» | Fuerza exploración/diseño primero |
| «Primero muéstrame el plan.» | Punto de aprobación antes del gasto |
| «Enséñame los archivos que vas a tocar, y espera.» | Revisión de alcance |
| «Explícame por qué, no solo qué.» | Saca los supuestos a la superficie |
| «Si algo es ambiguo, pregunta en vez de asumir.» | Baja el riesgo de deriva |
| «Hazlo en el orden más chico que funcione.» | Corta la sobre-ingeniería |

## Iterar bien

La primera salida rara vez es la final, y está bien. Lo que separa a un
operador bueno de uno malo es **cómo corrige**:

```
❌ "no, mal, hazlo otra vez"
✅ "el enfoque está bien pero moviste la lógica a un archivo nuevo.
    Mantenla en sync_products.py, solo extrae la función de margen."
```

Corrección quirúrgica = una iteración. Corrección vaga = tres iteraciones
y contexto quemado.

Y cuando la conversación ya se torció dos veces: **no la enderezas, la
reinicias**. `Esc` para interrumpir, `/clear`, y reescribe el prompt
incorporando lo que aprendiste. Un intento limpio con mejor prompt gana a
cinco correcciones sobre un contexto contaminado. Interrumpir temprano es
una habilidad: cada segundo que dejas correr un bucle equivocado es
contexto que vas a tener que limpiar.

## Checklist de bolsillo

Antes de mandar un prompt no trivial:

- [ ] ¿Dije el resultado, o solo los pasos?
- [ ] ¿Puse las rutas y símbolos que ya sé?
- [ ] ¿Dije qué NO tocar?
- [ ] ¿Hay un criterio observable de "terminado"?
- [ ] ¿Hay un comando que lo verifique?
- [ ] ¿Dije si commitea o solo muestra el diff?
- [ ] ¿El contexto está limpio para esta tarea? (`/clear`)
