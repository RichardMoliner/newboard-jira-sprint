@echo off
setlocal
title Painel de Sprints - Jira
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ================================================================
    echo  Node.js nao foi encontrado nesta maquina.
    echo  Instale a versao LTS em https://nodejs.org/ e rode este arquivo
    echo  novamente depois.
    echo ================================================================
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo Criando arquivo .env a partir do .env.example...
    copy /y ".env.example" ".env" >nul
)

if not exist "node_modules" (
    echo.
    echo Primeira execucao: instalando dependencias ^(pode levar alguns minutos^).
    echo Certifique-se de estar conectado na rede/VPN da Betha antes de continuar.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ================================================================
        echo  Falha ao instalar as dependencias. Verifique sua conexao com a
        echo  rede/VPN da Betha e rode este arquivo novamente.
        echo ================================================================
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ================================================================
echo  Subindo o painel... o navegador vai abrir sozinho em alguns segundos.
echo  Na primeira vez, configure a vertical e as credenciais do Jira na
echo  tela que aparecer.
echo.
echo  NAO FECHE esta janela enquanto estiver usando o painel.
echo  Para encerrar o painel, feche esta janela.
echo ================================================================
echo.

start "" cmd /c "timeout /t 8 >nul && start http://localhost:5173"
call npm run dev

pause
