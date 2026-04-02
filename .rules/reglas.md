DEJA DE HACERME EL NPM RUN BUILD DSEPUES DE CADA CAMBIO EN EL CODIGO

AL CREAR ENTIDADES EN TYPEORM O AGREGAR CAMPOS DE FECHA:
Siempre usa el tipo `timestamptz` para las fechas en PostgreSQL. Esto aplica para columnas comunes (`@Column({ type: 'timestamptz' })`) y también para los decoradores automáticos de fecha (`@CreateDateColumn({ type: 'timestamptz' })`, `@UpdateDateColumn({ type: 'timestamptz' })`).
