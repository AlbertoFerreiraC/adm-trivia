<?php
class Ruta
{
    public static function ctrRuta(): string
    {
        return URL_FRONTEND;
    }

    public static function ctrRutaApi(): string
    {
        return '../api-trivia';
    }
}
