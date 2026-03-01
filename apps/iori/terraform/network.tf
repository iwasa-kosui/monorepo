resource "aws_lightsail_static_ip" "microblog" {
  name = "microblog-static-ip"
}

resource "aws_lightsail_static_ip_attachment" "microblog" {
  static_ip_name = aws_lightsail_static_ip.microblog.name
  instance_name  = aws_lightsail_instance.microblog.name
}

resource "aws_lightsail_instance_public_ports" "microblog" {
  instance_name = aws_lightsail_instance.microblog.name

  port_info {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidrs     = ["0.0.0.0/0"]
  }
}
