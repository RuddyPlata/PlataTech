/* Interruptor unico del cobro con tarjeta.
 *
 * AZUL habilita el ambiente de produccion recien DESPUES de aprobar el sitio.
 * Mientras no tengamos las credenciales de produccion, el cobro con tarjeta no
 * se puede completar, asi que ninguna pagina debe ofrecerlo ni describirlo como
 * disponible.
 *
 * Vive en un solo archivo a proposito: antes el carrito y la ficha de producto
 * decian cosas distintas sobre como se paga, y esa clase de contradiccion es
 * justo lo que hunde una revision de AZUL.
 *
 * Para activarlo: poner los secrets de AZUL en Supabase, dejar AZUL_ENV=prod y
 * cambiar esta linea a true. No hay que tocar nada mas.
 */
window.AZUL_ENABLED = false;
