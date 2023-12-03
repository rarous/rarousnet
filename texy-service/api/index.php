<?php

declare(strict_types=1);

if (@!include __DIR__ . '/../vendor/autoload.php') {
  die('Install packages using `composer install`');
}

$texy = new Texy();

Texy\Configurator::safeMode($texy);

$texy->allowed['phrase/ins'] = true;
$texy->allowed['phrase/sup'] = true;
$texy->allowed['phrase/del'] = true;
$texy->allowed['phrase/sub'] = true;
$texy->allowed['phrase/cite'] = true;

$texy->allowedTags = false;
$texy->headingModule->top = 4;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: s-maxage=0, max-age=0, must-revalidate');

echo json_encode($_REQUEST);

//echo $texy->process($_POST["text"]);
