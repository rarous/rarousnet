<?php

declare(strict_types=1);

if (@!include __DIR__ . '/vendor/autoload.php') {
  die('Install packages using `composer install`');
}

function youtubeHandler($invocation, $cmd, $args, $raw)
{
  if ($cmd == 'youtube') {
    $videoId = $args[0];
    $output = '<iframe width="560" height="315" class="youtube-video"
      src="https://www.youtube-nocookie.com/embed/' . $videoId . '"
      title="YouTube video player" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen></iframe>';
    return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
  }
  return $invocation->proceed();
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
$texy->imageModule->root = 'https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto/https://www.rarous.net/data/obrazky/';

$texy->addHandler('script', 'youtubeHandler');

$output = array();
foreach ($articles as $url => $text) {
  $output[$url] = $texy->process($text);
}

echo json_encode($output);
