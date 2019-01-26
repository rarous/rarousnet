<?php
include 'texy.phar';

function insertFlash($invocation, $cmd, $args, $raw)
{
    switch ($cmd) {
        case 'flash':
            $movie = Texy::escapeHtml($args[0]);
            $width = $args[1];
            $height = $args[2];
            $vars = Texy::escapeHtml($args[3]);
            $output = '<!--[if !IE]> -->
			<object type="application/x-shockwave-flash" data="' . $movie . '" width="' . $width . '" height="' . $height . '">
			<!-- <![endif]-->
			<!--[if IE]>
			<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"
			  codebase="http://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=6,0,0,0"
			  width="' . $width . '" height="' . $height . '">
			  <param name="movie" value="' . $movie . '" />
			<!--><!--dgx-->
			  <param name="loop" value="true" />
			  <param name="menu" value="false" />
			  <param name="allowfullscreen" value="true" />
			  <param name="flashvars" value="' . $vars . '" />
			</object>
			<!-- <![endif]-->';
            return $invocation->texy->protect($output, Texy::CONTENT_MARKUP);
        default: // neumime zpracovat, zavolame dalsi handler v rade
            return $invocation->proceed();
    }
}

$contents = file_get_contents('php://stdin');
$articles = json_decode($contents, true);

$texy = new Texy();

$texy->allowed['phrase/ins'] = TRUE;
$texy->allowed['phrase/sup'] = TRUE;
$texy->allowed['phrase/del'] = TRUE;
$texy->allowed['phrase/sub'] = TRUE;
$texy->allowed['phrase/cite'] = TRUE;
$texy->allowed['figure'] = TRUE;
$texy->allowedTags = TRUE;
$texy->headingModule->top = 3;
$texy->headingModule->generateID = TRUE;
$texy->figureModule->class = 'image';
$texy->addHandler('script', 'insertFlash');

$output = array();
foreach ($articles as $url => $text) {
    $output[$url] = $texy->process($text);
}

echo json_encode($output);
