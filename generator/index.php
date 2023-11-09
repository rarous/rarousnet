<?php

declare(strict_types=1);

if (@!include __DIR__ . '/vendor/autoload.php') {
  die('Install packages using `composer install`');
}

function scriptHandler(Texy\HandlerInvocation $invocation, $command, array $args, $rawArgs)
{
  switch ($command) {
    case 'mixcloud-mini':
      $feed = rawurlencode($args[0]);
      $params = htmlspecialchars($args[1] ?? '');
      $output = '<iframe loading=lazy width="100%" height="60" class="player mixcloud-player mixcloud-player--mini"
        src="https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&mini=1&feed=' . $feed . '&' . $params . '"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'mixcloud':
      $feed = rawurlencode($args[0]);
      $params = htmlspecialchars($args[1] ?? '');
      $output = '<iframe loading=lazy width="100%" height="120" class="player mixcloud-player"
        src="https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=' . $feed . '&' . $params . '"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'spotify':
      $audioId = htmlspecialchars($args[0]);
      $output = '<iframe loading=lazy class="player spotify-player"
        src="https://open.spotify.com/embed/episode/' . $audioId . '"
        width="100%" height="152" allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    case 'youtube':
      $videoId = htmlspecialchars($args[0]);
      $output = '<iframe loading=lazy width="560" height="315" class="player youtube-player"
      src="https://www.youtube-nocookie.com/embed/' . $videoId . '"
      title="YouTube video player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen></iframe>';
      return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
    default:
      return $invocation->proceed();
  }
}

function imagehandler(Texy\HandlerInvocation $invocation, Texy\Image $image, Texy\Link $link = null): ?Texy\HtmlElement
{
  $el = $invocation->proceed();
  // enables automatic resizing on cloudinary via Client Hints
  return $el->setAttribute('sizes', '100vw');
}

function blockHandler(Texy\HandlerInvocation $invocation, $blocktype, $content, $lang, Texy\Modifier $modifier): ?Texy\HtmlElement
{
  if ($blocktype !== 'block/code') {
    return $invocation->proceed();
  }
  $el = $invocation->proceed();
  $code = $el->offsetGet(0);
  // use Prism.js pattern for code lang
  $code->class = "language-$lang";
  return $el->setAttribute('class', null);
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
// Auto fetch images to Cloudinary and make them responsive via Client Hints
$texy->imageModule->root = 'https://res.cloudinary.com/rarous/image/fetch/dpr_auto,f_auto,q_auto,w_auto:100:800/https://www.rarous.net/data/obrazky/';

$texy->addHandler('script', 'scriptHandler');
$texy->addHandler('image', 'imageHandler');
$texy->addHandler('block', 'blockHandler');

$output = array();
foreach ($articles as $url => $text) {
  $output[$url] = $texy->process($text);
}

echo json_encode($output);
