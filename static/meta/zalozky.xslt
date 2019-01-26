<?xml version="1.0" encoding="utf-8" ?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output encoding="utf-8" omit-xml-declaration="yes" method="xml" indent="yes" media-type="text/html; charset=utf-8" />

<xsl:template match="xbel">
	<xsl:apply-templates select="folder"/>
</xsl:template>
	
<xsl:template match="xbel/folder">
	<xsl:apply-templates select="folder" />
</xsl:template>

<xsl:template match="folder">
<table>
<caption><xsl:value-of select="title"/></caption>
	
<thead>
	<tr>
		<th class="sloupec">Název</th><th>Popis</th>
	</tr>
</thead>
	
<tbody>
<xsl:for-each select="bookmark">
	<tr>
		<td><a><xsl:attribute name="href"><xsl:value-of select="@href"/></xsl:attribute><xsl:value-of select="title"/></a></td>
		<td><xsl:value-of select="desc"/></td>
	</tr>
</xsl:for-each>
</tbody>
</table>
</xsl:template>
	
</xsl:stylesheet>