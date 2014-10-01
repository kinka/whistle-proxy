Whistle-Proxy
=============

This is a proxy server running as a chrome pacakged app. It is based on sample webserver which demonstration of Chrome's new networking stack. I write this app just for convience as a proxy server serving for local files. More powerfull cooperating with the chrome extension [whistle](https://github.com/Kinka/whistle). Thanks to Chrome devtool's network mapping utility, chrome devtool's Sources pannel can be used as an javascript editor, editing online static files such as javascripts and stylesheets in time.
You can download it [here](/assets/whistle-proxy.crx).

How it works
-------------
Firstly, add your local workspace by clicking on the __Add__ button, and choose your directory. Secondly, choose your network interface such as 127.0.0.1, and any valid port(8888 for example). Lastly, click __start__, without exception you can access your local resources by url http://127.0.0.1:8888/my/resource.js.

Why I do this
-------------
You may say that nodejs or python can easily do this. I think using nodejs or python still needs some tackling.My ubuntu just has no nodejs installed...So many module dependencies, I don't like that.Aslo in many cases, having a chrome browser installed is far more convient.

-------------
Any suggestion is welcome, thanks. [kinkabrain@gmail.com](mailto:kinkabrain@gmail.com).

![screenshot](/assets/screenshot.png)
