@echo off
rem ============================================================================
rem Sobe o ambiente local completo (PGLite + Next dev) em janelas separadas,
rem INDEPENDENTE de sessao de agente/terminal - as janelas sobrevivem sozinhas.
rem
rem Uso:
rem   scripts\start-servers.cmd          (duplo-clique funciona)
rem
rem Dica: criar atalho na area de trabalho ou tarefa no Task Scheduler
rem ("Ao fazer logon") apontando pra este arquivo.
rem ============================================================================
setlocal
cd /d "%~dp0.."

rem -- Detecta o diretorio do banco PGLite (pega o mais recente .pglite-full-*)
set "PGDIR="
for /f "delims=" %%D in ('dir /b /ad /o-n ".pglite-full-*" 2^>nul') do (
  if not defined PGDIR set "PGDIR=%%D"
)
if not defined PGDIR (
  echo [erro] Nenhum diretorio .pglite-full-* encontrado em %CD%.
  pause
  exit /b 1
)

rem -- Evita instancia duplicada checando a porta 51218
netstat -ano | findstr /r /c:":51218 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [ok] PGLite ja esta escutando na porta 51218 - pulando.
) else (
  echo [..] Subindo PGLite com banco "%PGDIR%"...
  start "PGLite 51218 - %PGDIR%" cmd /k node node_modules\@electric-sql\pglite-socket\dist\scripts\server.js --db %PGDIR% --host 0.0.0.0 --port 51218 --max-connections 10
  rem Da um folego pro banco aceitar conexoes antes do Next subir
  timeout /t 3 /nobreak >nul
)

rem -- Next dev (porta 3000)
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [ok] Next ja esta escutando na porta 3000 - pulando.
) else (
  echo [..] Subindo Next dev...
  start "Next dev 3000" cmd /k npm run dev
)

echo.
echo [ok] Ambiente iniciado:
echo      Local: http://localhost:3000
echo      LAN:   http://172.17.10.163:3000
echo.
echo Para derrubar: feche as duas janelas (PGLite e Next).
endlocal
