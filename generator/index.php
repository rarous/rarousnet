<?php

declare(strict_types=1);

if (@!include __DIR__ . '/vendor/autoload.php') {
  die('Install packages using `composer install`');
}

function scriptHandler($invocation, $cmd, $args, $rawArgs)
{
  switch ($cmd) {
    case 'mixcloud-mini':
      $feed = htmlspecialchars($args[0]);
      $params = htmlspecialchars($args[1] ?? '');
      $output = '<iframe width="100%" height="60" class="player mixcloud-player mixcloud-player--mini"
        src="https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&mini=1&feed=' . $feed . '&' . $params . '"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'mixcloud':
      $feed = htmlspecialchars($args[0]);
      $params = htmlspecialchars($args[1] ?? '');
      $output = '<iframe width="100%" height="120" class="player mixcloud-player"
        src="https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=' . $feed . '&' . $params . '"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'spotify':
      $audioId = htmlspecialchars($args[0]);
      $output = '<iframe class="player spotify-player"
        src="https://open.spotify.com/embed/episode/' . $audioId . '"
        width="100%" height="152" allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'youtube':
      $videoId = htmlspecialchars($args[0]);
      $output = '<iframe width="560" height="315" class="player youtube-player"
      src="https://www.youtube-nocookie.com/embed/' . $videoId . '"
      title="YouTube video player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    default:
      return $invocation->proceed();
  }
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

$texy->addHandler('script', 'scriptHandler');

$output = array();
foreach ($articles as $url => $text) {
  $output[$url] = $texy->process($text);
}

echo json_encode($output);
