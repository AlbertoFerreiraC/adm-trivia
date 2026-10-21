<?php
if (file_exists(__DIR__ . '/claves.env')) {
    $lines = file(__DIR__ . '/claves.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0 || strpos($line, '=') === false) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value, " \t\n\r\0\x0B\"'");
    }
}

define('NOMBRE_APP', $_ENV['APP_NAME'] ?? 'Trivia Seguridad Vial');
define('URL_FRONTEND', $_ENV['RUTA_FRONTEND'] ?? './');
define('URL_API_BASE', $_ENV['RUTA_API'] ?? '../api-trivia/api/v1');