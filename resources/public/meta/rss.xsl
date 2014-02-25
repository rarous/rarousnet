<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method = "xml"  version="1.0" omit-xml-declaration="yes" indent="yes"  />
	
	<xsl:template match="/">
		<xsl:apply-templates select="rss/channel"/>
	</xsl:template>
	
	
	<xsl:template match="channel">
		<h2><xsl:value-of select="title"/></h2>
		<ul class="archiv">
			<xsl:apply-templates select="item"/>
		</ul>
	</xsl:template>
	
	<xsl:template match="image">
		<img src="{url}" title="{title}" alt="{title}" width="{width}" height="{height}"/>
	</xsl:template>
	
	<xsl:template match="description">
		<p class="description">
			<xsl:value-of select="text()"/>
		</p>
	</xsl:template>
	
	<xsl:template match="item">
		<li><a href="{link}"><xsl:value-of select="title"/></a></li>
	</xsl:template>
</xsl:stylesheet>