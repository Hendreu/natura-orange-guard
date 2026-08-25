@echo off
cd /d "C:\Users\HendreuVitorTomadoce\OneDrive - Act Digital\Documentos\Natura\qualys-data-view\natura-orange-guard"
set DATABASE_URL=postgresql://qualys_natura_gv:943e752cc1190382e5b899c33cfd84f457244a69@10.224.1.244:5432/qualys_db
"C:\Users\HendreuVitorTomadoce\AppData\Roaming\npm\bun.cmd" run etl >> "C:\Users\HendreuVitorTomadoce\OneDrive - Act Digital\Documentos\Natura\qualys-data-view\natura-orange-guard\etl.log" 2>&1
