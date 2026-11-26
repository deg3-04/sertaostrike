@echo off
chcp 65001 >nul
title Sertao Strike - Servidor
cd /d "%~dp0"
echo.
if not exist "server\index.js" (
  echo  [ERRO] Os arquivos do jogo nao foram encontrados nesta pasta.
  echo  Provavelmente o .zip nao foi extraido. Clique com o botao direito
  echo  em sertao-strike.zip, escolha "Extrair tudo..." e rode este arquivo
  echo  de dentro da pasta extraida.
  echo.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo  Instale a versao LTS em https://nodejs.org , feche esta janela e tente de novo.
  echo  ^(Se acabou de instalar, reinicie o computador ou abra uma nova janela.^)
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set NODEV=%%v
set NODEV=%NODEV:v=%
echo  Node.js encontrado: versao %NODEV%
if %NODEV% LSS 16 (
  echo  [ERRO] Seu Node.js e muito antigo. Instale a versao LTS em https://nodejs.org
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\ws" (
  echo  Instalando dependencias...
  call npm install --omit=dev
)
node server\index.js
echo.
echo  O servidor foi encerrado. Se apareceu algum erro acima, tire um print desta janela.
pause
