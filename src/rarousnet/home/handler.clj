(ns rarousnet.home.handler
  (:require
    [compojure.core :refer [defroutes GET ANY]]
    [net.cgrand.enlive-html :refer [deftemplate]]
    [ring.util.response :refer [charset]]))

(deftemplate home-template "home/index.html" [])
(deftemplate webdesign-template "home/webdesign.html" [])
(deftemplate photos-template "home/photos.html" [])

(defn render [template]
  (-> {:status 200
       :headers {"Content-Type" "text/html"
                 "Content-Security-Policy" "default-src 'none'; font-src https://fonts.gstatic.com; img-src 'self' https://chart.googleapis.com https://res.cloudinary.com https://s.gravatar.com https://ssl.google-analytics.com https://www.google-analytics.com; script-src 'unsafe-inline' https://ajax.cloudflare.com/cdn-cgi/nexp/dok3v=85b614c0f6/cloudflare.min.js https://ajax.googleapis.com/ajax/libs/webfont/1.5.18/webfont.js https://ssl.google-analytics.com/ga.js https://www.google-analytics.com/analytics.js; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com/"}
       :body (apply str template)}
      (charset "UTF-8")))

(defn moved-permanently [location]
  {:status 301
   :headers {"Location" location}})

(defn home [] (render (home-template)))
(defn webdesign [] (render (webdesign-template)))
(defn photos [] (render (photos-template)))
(defn redirect-home [] (moved-permanently "/"))
(defn redirect-reference [] (moved-permanently "/webdesign/"))
(defn redirect-photos [] (moved-permanently "/photos/"))
(defn redirect-texy [] (moved-permanently "http://texy-rarous.rhcloud.com/ws/endpoint.php"))

(defroutes routes
  (GET "/" [] (home))
  (GET "/webdesign/" [] (webdesign))
  (GET "/photos/" [] (photos))

  (GET "/contact" [] (redirect-home))
  (GET "/kontakt" [] (redirect-home))
  (GET "/default.aspx" [] (redirect-home))
  (GET "/about.aspx" [] (redirect-home))
  (GET "/stranky.aspx" [] (redirect-home))
  (GET "/odkazy.aspx" [] (redirect-home))
  (GET "/skola.aspx" [] (redirect-home))
  (GET "/Default.aspx" [] (redirect-home))
  (GET "/reference.aspx" [] (redirect-reference))
  (GET "/weblog/reference.aspx" [] (redirect-reference))
  (GET "/weblog/projekty.aspx" [] (redirect-reference))
  (GET "/webdesign" [] (redirect-reference))
  (GET "/galerie.aspx" [] (redirect-photos))
  (GET "/Galerie.aspx" [] (redirect-photos))
  (GET "/galerie/:url" [] (redirect-photos))
  (GET "/photos" [] (redirect-photos))
  (ANY "/texy-ws/endpoint.php" [] (redirect-texy)))
