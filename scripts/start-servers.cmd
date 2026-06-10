@echo off
rem ============================================================================
rem Sobe o ambiente local completo (PGLite + Next) em janelas separadas,
rem INDEPENDENTE de sessao de agente/terminal - as janelas sobrevivem sozinhas.
rem
rem Uso:
rem   scripts\start-servers.cmd          -> PRODUCAO (next start; rapido/leve,
rem                                         recomendado quando outras pessoas
rem                                         usam o site pela LAN)
rem   scripts\start-servers.cmd dev      -> desenvolvimento (next dev, HMR)
rem
rem Producao serve o build de .next. Se nao houver build (ou apos mudar o
rem codigo), o script roda "npm run build" antes - pode levar ~1 min.
rem
rem Dica: criar atalho na area de trabalho ou tarefa no Task Scheduler
rem ("Ao fazer logon") apontando pra este arquivo.
rem ============================================================================
setlocal
cd /d "%~dp0.."

set "MODE=%~1"
if /i "%MODE%"=="dev" (set "MODE=dev") else (set "MODE=prod")

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

rem -- Next (porta 3000)
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [ok] Next ja esta escutando na porta 3000 - pulando.
  goto :done
)

if /i "%MODE%"=="dev" (
  echo [..] Subindo Next em modo DEV ^(HMR^)...
  start "Next dev 3000" cmd /k npm run dev
  goto :done
)

rem -- Producao: garante build antes do start
if not exist ".next\BUILD_ID" (
  echo [..] Sem build de producao - rodando "npm run build" ^(~1 min^)...
  call npm run build
  if errorlevel 1 (
    echo [erro] Build falhou - corrija antes de servir producao.
    pause
    exit /b 1
  )
)
echo [..] Subindo Next em modo PRODUCAO ^(next start^)...
start "Next prod 3000" cmd /k npm run start

:done
echo.
echo [ok] Ambiente iniciado (%MODE%):
echo      Local: http://localhost:3000
echo      LAN:   http://172.17.10.163:3000
echo.
echo Para derrubar: feche as duas janelas (PGLite e Next).
echo Apos alterar o codigo, rode "npm run build" e reinicie a janela do Next.
endlocal
