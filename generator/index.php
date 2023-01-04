<?php

declare(strict_types=1);

if (@!include __DIR__ . '/vendor/autoload.php') {
  die('Install packages using `composer install`');
}

$contents = file_get_contents('php://stdin');
$articles = json_decode($contents, true);

$texy = new Texy();

$texy->allowed['phrase/ins'] = true;
$texy->allowed['phrase/sup'] = true;
$texy->allowed['phrase/del'] = true;
$texy->allowed['phrase/sub'] = true;
$texy->allowed['phrase/cite'] = true;
$texy->allowed['figure'] = true;
$texy->allowedTags = true;
$texy->headingModule->top = 3;
$texy->headingModule->generateID = true;
$texy->figureModule->class = 'image';
$texy->imageModule->root = 'https://res.cloudinary.com/rarous-net/image/fetch/dpr_auto,f_auto/http://www.rarous.net/data/obrazky/';

$output = array();
foreach ($articles as $url => $text) {
  $output[$url] = $texy->process($text);
}

echo json_encode($output);
