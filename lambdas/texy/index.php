<?php
include 'texy.php';

$contents = file_get_contents('php://stdin');
$texy = new Texy\Texy();

echo $texy->process($contents);
