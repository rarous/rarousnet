<?php declare(strict_types=1);

if (@!include __DIR__ . '/../vendor/autoload.php') {
  die('Install packages using `composer install`');
}

use \Texy\Texy;
use \Texy\Link;
use \Texy\Configurator;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: s-maxage=0, max-age=0, must-revalidate');

$texy = new Texy();

Configurator::safeMode($texy);

$texy->allowed['phrase/ins'] = true;
$texy->allowed['phrase/sup'] = true;
$texy->allowed['phrase/del'] = true;
$texy->allowed['phrase/sub'] = true;
$texy->allowed['phrase/cite'] = true;

$texy->allowedTags = false;
$texy->headingModule->top = 4;

$references = json_decode($_REQUEST['references'], true);

foreach ($references as $index => $comment) {
  if (!isset($comment['link'])) continue;
  $name = $index + 1;
  $link = new Link($comment['link']);
  $link->label = $comment['label'];
  $texy->linkModule->addReference("$name", $link);
}

echo $texy->process($_REQUEST['text']);
