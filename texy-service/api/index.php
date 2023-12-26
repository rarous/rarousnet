<?php declare(strict_types=1);

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

$references = json_decode($_REQUEST['references'], true);
var_dump($references);
/*
for ($references as $name => $comment) {
  var_dump($name);
  var_dump($comment);
  $link = new Texy\Link($comment['link']);
  $link->label = $comment['label'];
  var_dump($link);
  $texy->linkModule->addReference($name, $link);
}

echo 'Referencess added';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: s-maxage=0, max-age=0, must-revalidate');

echo $_REQUEST['text'];
echo $texy->process($_REQUEST['text']);
*/