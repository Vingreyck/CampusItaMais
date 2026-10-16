-- Junta espaços repetidos nas categorias já gravadas (ex.: "Gestão Administrativa  e de Pessoal"),
-- que o filtro do quadro não reconhecia.
UPDATE "tasks" SET "category" = btrim(regexp_replace("category", '\s+', ' ', 'g')) WHERE "category" ~ '\s\s|^\s|\s$';
