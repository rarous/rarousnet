<?php declare(strict_types=1);

if (@!include __DIR__ . '/../vendor/autoload.php') {
  die('Install packages using `composer install`');
}

use \Rollbar\Rollbar;
use \Rollbar\Payload\Level;
use \Texy\Texy;
use \Texy\Configurator

Rollbar::init(
  array(
    'access_token' => '16eb2b188b784fada411b451d37848ee',
    'environment' => 'production'
  )
);
Rollbar::log(Level::INFO, 'Test info message');
throw new Exception('Test exception');

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
Rollbar::log(
  Level::INFO,
  'references raw: ',
  $_REQUEST['references']
);
Rollbar::log(
  Level::INFO,
  'references decoded: ',
  $references
);

foreach ($references as $name => $comment) {
  Rollbar::log(
    Level::INFO,
    'comment: ',
    $comment
  );
  if (!isset($comment['link'])) continue;
  $link = new Texy\Link($comment['link']);
  $link->label = $comment['label'];
  $texy->linkModule->addReference("$name", $link);
}

echo $texy->process($_REQUEST['text']);
