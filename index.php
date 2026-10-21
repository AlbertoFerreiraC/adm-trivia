<?php
require_once __DIR__ . '/variableGlobal.php';
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/models/rutas.php';
require_once __DIR__ . '/gestionArchivos/gestorArchivos.php';
require_once __DIR__ . '/controllers/plantilla.controlador.php';

$plantilla = new ControladorPlantilla();
$plantilla->ctrPlantilla();

