<?php
class GestorArchivos
{
    public static function versionAsset(string $relativePath): string
    {
        $fullPath = __DIR__ . '/../' . ltrim($relativePath, '/');
        $ver = is_file($fullPath) ? filemtime($fullPath) : time();
        return $relativePath . '?v=' . $ver;
    }
}
